import { ModelGraphNode } from ".";
import { AggregationKind, Diagram, DiagramElement, Generalization, GeneralizationSet, ModelElement, OntoumlElement, 
    OntoumlType, Package, Relation, Stereotype, RelationStereotype } from "@libs/ontouml";
import uniqid from 'uniqid';
import { cloneDeep } from 'lodash'

interface IElement {
    [id: string]: ModelGraphNode;
}

interface IDiagramElement {
    [id: string]: DiagramElement;
}

export class ModelGraph {
    allNodes: IElement = {};
    allRelations: IElement = {};
    allViews: IDiagramElement = {};
    allStereotypes: {};
    idMap: {};

    // --------------------------------------------------------------------------------
    // Construction functions
    // --------------------------------------------------------------------------------
    constructor(model: Package, diagram: Diagram) {
        this.allStereotypes = {};
        this.idMap = {};

        diagram.getContents()
            .filter(e => e.type === OntoumlType.CLASS_VIEW)
            .forEach(classView => this.includeElement(this.allNodes, classView, model));
        
        diagram.getContents()
            .filter(e => (e.type === OntoumlType.RELATION_VIEW) || (e.type === OntoumlType.GENERALIZATION_VIEW))
            .forEach(relationView => {
                const relation = this.includeElement(this.allRelations, relationView, model);
                let sourceId = (relationView.type === OntoumlType.RELATION_VIEW) 
                    ? (relation.element as Relation).properties[0].propertyType.id
                    : (relation.element as Generalization).specific.id;
                let targetId = (relationView.type === OntoumlType.RELATION_VIEW) 
                    ? (relation.element as Relation).properties[1].propertyType.id
                    : (relation.element as Generalization).general.id;
                // TODO: delete when error with aggregation is fixed
                if ((relationView.type === OntoumlType.RELATION_VIEW) && 
                    ((relation.element as Relation).properties[1]
                        .aggregationKind === AggregationKind.COMPOSITE)) {
                        const id = sourceId;
                        sourceId = targetId;
                        targetId = id;
                    }
                this.createConnection(this.allNodes[sourceId], relation);
                this.createConnection(relation, this.allNodes[targetId]);   
            });
        
        diagram.getContents()
            .filter(e => e.type === OntoumlType.GENERALIZATION_SET_VIEW)
            .forEach(genSetView => {
                const node = this.includeElement(this.allRelations, genSetView, model);
                const generalizations = (node.element as GeneralizationSet).generalizations;
                generalizations.forEach(relation  => {
                    this.createConnection(this.allRelations[relation.id], node);
                });
                const generalization = this.allRelations[generalizations[0].id].element as Generalization;
                this.createConnection(node, this.allNodes[generalization.general.id]);
            });
    }

    updateRepresentationIds(element: DiagramElement): DiagramElement {
        const newId = uniqid();
        this.idMap[element.id] = newId;
        element.id = newId;
        // @ts-ignore
        element.shape.id = newId + "_shape";
        return element;
    }

    updateModelElementIds(element: OntoumlElement): OntoumlElement {
        const newId = uniqid();
        this.idMap[element.id] = newId;
        element.id = newId;
        if (element.type === OntoumlType.RELATION_TYPE) {
            (element as Relation).properties[0].id = newId + "_prop0";
            (element as Relation).properties[1].id = newId + "_prop1";
        }
        return element;
    }

    includeElement(elementMap: {}, element: DiagramElement, model: Package): ModelGraphNode {
        // @ts-ignore
        let modelElement = element.modelElement;
        element = this.updateRepresentationIds(element);
        if (this.idMap[modelElement.id]) {
            // add one more view to the relation/class that has been already processed
            modelElement = elementMap[this.idMap[modelElement.id]].element;
            elementMap[modelElement.id].representations.push(element);
        } else {
            modelElement = this.updateModelElementIds(model.getElementById(modelElement.id));
            const newNode = new ModelGraphNode(modelElement as ModelElement, element);
            elementMap[modelElement.id] = newNode;
            // @ts-ignore
            const stereotype = newNode.element.stereotype;
            if (stereotype) {
                if (this.allStereotypes[stereotype]){
                    this.allStereotypes[stereotype].push(newNode);
                } else {
                    this.allStereotypes[stereotype] = [newNode];
                } 
            }
        }
        // @ts-ignore
        element.modelElement = modelElement;
        this.allViews[element.id] = element;
        return elementMap[modelElement.id];
     }

    createConnection(source: ModelGraphNode, target: ModelGraphNode) {
        source.outs.push(target);
        target.ins.push(source); 
    }

    // --------------------------------------------------------------------------------
    // Export functions
    // --------------------------------------------------------------------------------

    exportModel(name: string): Package {
        let model = new Package();
        model.id = uniqid();
        model.setName(name); 
        model.contents = [
            ...Object.values(this.allNodes).map(node => node.element), 
            ...Object.values(this.allRelations).map(node => node.element),
        ];
        return model;
    }

    exportDiagram(name: string, owner: Package): Diagram {
        let diagram = new Diagram();
        diagram.id = uniqid();
        diagram.setName(name);
        diagram.owner = owner;
        // TODO: fix if possible, the next line doesn't help
        // @ts-ignore
        diagram.contents = Object.values(this.allViews);
        return diagram;
    }

    // --------------------------------------------------------------------------------
    // Auxiliary functions
    // --------------------------------------------------------------------------------

    getElementsByStereotypes(stereotypes: Stereotype[]): ModelGraphNode[] {
        let nodes = [];
        stereotypes?.forEach(stereotype => {
            const newNodes = this.allStereotypes[stereotype] || [];
            nodes = [...nodes, ...newNodes];
        });
        return nodes;
    }

    /**
     * Removes relation node, all links to it, and all representations
     * @param relation Relation to be removed
     */
    removeRelation(relation: ModelGraphNode) {
        console.log("Remove relation: " + relation.element.getName());
        delete this.allRelations[relation.element.id];

        // because of the generalization set, which has more than one incoming
        relation.ins.forEach(inNode => inNode.removeOutRelation(relation));
        relation.outs[0].removeInRelation(relation);

        relation.representations.forEach(releationView => 
            delete this.allViews[releationView.id]
        );
    }

    /**
     * Removes class node, and all links to/from it
     * @param node Class to be removed
     */
    removeNode(node: ModelGraphNode) {
        console.log("Remove node: " + node.element.getName());
        delete this.allNodes[node.element.id];

        node.ins.forEach(inRelation => this.removeRelation(inRelation));
        node.outs.forEach(outRelation => this.removeRelation(outRelation));
        
        node.representations.forEach(nodeView => 
            delete this.allViews[nodeView.id]
        );
            
    }

    /**
     * Creates a copy of the given relation and moves it to new nodes
     * Used for abstracting aspects
     * @param prototype original relation
     * @param fromNode node to be used as source
     * @param toNode node to be used as target
     */
    duplicateRelation(prototype: ModelGraphNode, fromNode: ModelGraphNode, toNode: ModelGraphNode = null){
        let newRelationNode = cloneDeep(prototype);
        const newRelation = (newRelationNode.element as Relation);
        const roleName = (newRelation.properties[0].getName()) 
            ? newRelation.properties[0].getName() 
            : newRelation.getName();
        this.updateRepresentationIds(newRelationNode.representations[0]);
        this.updateModelElementIds(newRelation)
        this.allRelations[newRelation.id] = newRelationNode;
        this.allViews[newRelationNode.representations[0].id] = newRelationNode.representations[0];

        const stereotype = newRelation.stereotype;
        if (stereotype) {
            if (this.allStereotypes[stereotype]){
                this.allStereotypes[stereotype].push(newRelationNode);
            } else {
                this.allStereotypes[stereotype] = [newRelationNode];
            } 
        }

        if (!toNode) {
            newRelationNode.moveRelationFrom(fromNode, "", false, true);
            newRelation.properties[1].cardinality.setLowerBoundFromNumber(0);
            newRelation.setName(fromNode.element.getName() + "'s " + roleName + " " + newRelation.getName());
        } else {
            newRelationNode.moveRelationFrom(fromNode, "", false, true);
            newRelationNode.moveRelationTo(toNode, "", false, false, false, true);
            newRelation.stereotype = RelationStereotype.PARTICIPATION;
        }
    }

    printNodeById(id: string) {
        console.log("Name: " + this.allNodes[id].element.getName());
        console.log("No. of ins: " + this.allNodes[id].ins.length);
        console.log("No. of outs: " + this.allNodes[id].outs.length);
    }
}