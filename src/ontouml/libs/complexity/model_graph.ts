import { ModelGraphNode } from ".";
import { Diagram, DiagramElement, Generalization, GeneralizationSet, ModelElement, OntoumlElement, 
    OntoumlType, Package, Relation, Stereotype, RelationStereotype, RelationView, ClassView } from "@libs/ontouml";
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

    // TODO: delete when error with aggregation is fixed
    /*
    if ((relationView.type === OntoumlType.RELATION_VIEW) && 
        ((relation.element as Relation).properties[1]
            .aggregationKind === AggregationKind.COMPOSITE)) {
            const id = sourceId;
            sourceId = targetId;
            targetId = id;
        }
    */
    
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
                let sourceId = ((relationView as RelationView).source as ClassView).modelElement.id;
                let targetId = ((relationView as RelationView).target as ClassView).modelElement.id;
                this.createConnection(this.allNodes[sourceId], relation);
                this.createConnection(relation, this.allNodes[targetId]);   
            });
        
        diagram.getContents()
            .filter(e => e.type === OntoumlType.GENERALIZATION_SET_VIEW)
            .forEach(genSetView => {
                const node = this.includeElement(this.allRelations, genSetView, model);
                const generalizations = (node.element as GeneralizationSet).generalizations;
                generalizations.forEach(generalization  => {
                    // this.createConnection(this.allRelations[generalization.id], node);
                    this.createConnection(this.allNodes[generalization.specific.id], node);
                });
                const generalization = this.allRelations[generalizations[0].id].element as Generalization;
                this.createConnection(node, this.allNodes[generalization.general.id]);
            });
    }

    /**
     * Incorporates view and corresponding element into graph
     * @param elementMap dictionary where to include
     * @param element view of the element to be included
     * @param model current model
     * @returns class/relation GraphNode
     */
    includeElement(elementMap: {}, element: DiagramElement, model: Package): ModelGraphNode {
        // @ts-ignore
        let modelElement = element.modelElement;
        element = this.updateRepresentationIds(element);

        if (this.idMap[modelElement.id]) {
            // add one more view to the relation/class that has been already processed
            modelElement = elementMap[this.idMap[modelElement.id]].element;
            elementMap[modelElement.id].representations.push(element);
        } else {
            // create new class/relation node
            modelElement = this.updateModelElementIds(model.getElementById(modelElement.id));
            const newNode = new ModelGraphNode(modelElement as ModelElement, [element]);
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

    /**
     * Updates ids in views and include old ids in idMap
     * @param element view, which ids will be updated
     * @returns view with new ids
     */
    updateRepresentationIds(element: DiagramElement): DiagramElement {
        const newId = uniqid();
        this.idMap[element.id] = newId;
        element.id = newId;
        // @ts-ignore
        element.shape.id = newId + "_shape";
        return element;
    }

    /**
     * Updates ids in relations/classes and include old ids in idMap
     * @param element relation/class, which ids will be updated
     * @returns relations/class with new ids
     */
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

    getRelationsByType(type: OntoumlType): ModelGraphNode[] {
        return Object.values(this.allRelations)
            .filter(relation => relation.element.type === type) || [];
    }

    /**
     * Removes relation node, all links to it, and all representations
     * @param relation Relation to be removed
     */
    removeRelation(relation: ModelGraphNode) {
        // because of the generalization set, which has more than one incoming
        relation.ins.forEach(inNode => inNode.removeOutRelation(relation));
        relation.outs[0].removeInRelation(relation);

        relation.representations.forEach(releationView => 
            delete this.allViews[releationView.id]
        );

        console.log("Remove relation: " + relation.element.getName());
        delete this.allRelations[relation.element.id];

        this.printRelations();
    }

    /**
     * Removes class node, and all links to/from it
     * @param node Class to be removed
     */
    removeNode(node: ModelGraphNode) {
        [...node.ins].forEach(inRelation => this.removeRelation(inRelation));
        [...node.outs].forEach(outRelation => this.removeRelation(outRelation));
        
        node.representations.forEach(nodeView => 
            delete this.allViews[nodeView.id]
        );

        console.log("Remove node: " + node.element.getName());
        delete this.allNodes[node.element.id];
        this.printGraph();            
    }

    /**
     * Creates a copy of the given relation and moves it to new nodes
     * Used for abstracting aspects
     * @param prototype original relation
     * @param fromNode node to be used as source
     * @param toNode node to be used as target
     */
    duplicateRelation(prototype: ModelGraphNode, fromNode: ModelGraphNode, toNode: ModelGraphNode = undefined){
        let relationNode = new ModelGraphNode(
            this.updateModelElementIds(cloneDeep(prototype.element)) as ModelElement, 
            cloneDeep(prototype.representations)
        );
        (relationNode.representations[0] as RelationView).modelElement = relationNode.element as Relation;
        this.updateRepresentationIds(relationNode.representations[0]);
        
        // update in and out links
        relationNode.ins.push(prototype.ins[0]);
        relationNode.outs.push(prototype.outs[0]);
        relationNode.ins[0].outs.push(relationNode);
        relationNode.outs[0].ins.push(relationNode);
        
        const relation = (relationNode.element as Relation);
        const roleName = (relation.properties[0].getName()) 
            ? relation.properties[0].getName() 
            : relationNode.ins[0].element.getName();

        
        // add to all lists
        this.allRelations[relation.id] = relationNode;
        relationNode.representations.forEach(representation => 
            this.allViews[representation.id] = representation
        );
        const stereotype = relation.stereotype;
        if (stereotype) {
            if (this.allStereotypes[stereotype]){
                this.allStereotypes[stereotype].push(relationNode);
            } else {
                this.allStereotypes[stereotype] = [relationNode];
            } 
        }

        if (!toNode) {
            relationNode.moveRelationFrom(fromNode, "", false, true);
            relation.properties[1].cardinality.setLowerBoundFromNumber(0);
            relation.setName(fromNode.element.getName() + "'s " + roleName + " " + relation.getName());
        } else {
            relationNode.moveRelationFrom(fromNode, "", false, true);
            relationNode.moveRelationTo(toNode, "", false, false, false, true);
            relation.stereotype = RelationStereotype.PARTICIPATION;
        }
    }

    // --------------------------------------------------------------------------------
    // Print functions
    // --------------------------------------------------------------------------------

    printNodeById(id: string) {
        console.log("Class " + this.allNodes[id].element.getName() + ", "
                    + this.allNodes[id].ins.length + " ins and " 
                    + this.allNodes[id].outs.length + " outs.");
    }

    printRelationById(id: string) {
        let name = this.allRelations[id].element.getName() ;
        if (name) { 
            name = "[" + name + "] -> ";
        } else {
            name = "";
        }
        console.log(this.allRelations[id].ins[0].element.getName() 
                    + " -> " + name 
                    + this.allRelations[id].outs[0].element.getName());   
    }

    printNodes(){
        Object.keys(this.allNodes)?.forEach(nodeId => this.printNodeById(nodeId));
    }

    printRelations(){
        Object.keys(this.allRelations)?.forEach(relationId => this.printRelationById(relationId));
    }

    printGraph() {
        console.log("No. of nodes " + Object.keys(this.allNodes).length);
        this.printNodes();
        console.log("No. of relations " + Object.keys(this.allRelations).length);
        this.printRelations();
        
    }
}