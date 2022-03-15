import { ModelGraphNode } from ".";
import { AggregationKind, Diagram, DiagramElement, Generalization, GeneralizationSet, ModelElement, OntoumlElement, 
    OntoumlType, Package, Relation, Stereotype } from "@libs/ontouml";
import uniqid from 'uniqid';

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

    constructor(model: Package, diagram: Diagram) {
        this.allStereotypes = {};
        this.idMap = {};

        diagram.getContents()
            .filter(e => e.type === OntoumlType.CLASS_VIEW)
            .forEach(classView => this.includeElement(this.allNodes, classView, model, false));
        
        diagram.getContents()
            .filter(e => (e.type === OntoumlType.RELATION_VIEW) || (e.type === OntoumlType.GENERALIZATION_VIEW))
            .forEach(relationView => {
                const relation = this.includeElement(this.allRelations, relationView, model, true);
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
                const node = this.includeElement(this.allRelations, genSetView, model, false);
                const generalizations = (node.element as GeneralizationSet).generalizations;
                generalizations.forEach(relation  => {
                    this.createConnection(this.allRelations[relation.id], node);
                });
                const generalization = this.allRelations[generalizations[0].id].element as Generalization;
                this.createConnection(node, this.allNodes[generalization.general.id]);
            });
    }

    updateRepresentationIds(element: DiagramElement, _hasSourceTarget: boolean): DiagramElement {
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

    includeElement(elementMap: {}, element: DiagramElement, model: Package, 
        hasSourceTarget: boolean): ModelGraphNode {
        // @ts-ignore
        let modelElement = element.modelElement;
        element = this.updateRepresentationIds(element, hasSourceTarget);
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
    // ------------------------END OF: Export functions--------------------------------
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
     * For debugging purposes only
     */
    printNodeById(id: string) {
        console.log("Name: " + this.allNodes[id].element.getName());
        console.log("No. ins: " + this.allNodes[id].ins.length);
        console.log("No. outs: " + this.allNodes[id].outs.length);
    }
}