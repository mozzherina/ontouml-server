import { Diagram, DiagramElement, GeneralizationSet, ModelElement, Generalization, OntoumlType, Package, Relation } from "@libs/ontouml";
import uniqid from 'uniqid';
class ModelGraphNode {
    element: ModelElement;
    representations: DiagramElement[];
    ins: ModelGraphNode[];
    outs: ModelGraphNode[];

    constructor(element: ModelElement, representation: DiagramElement) {
        this.element = element;
        this.representations = [representation];
        this.ins = [];
        this.outs = [];
    }
}

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

    constructor(model: Package, diagram: Diagram) {
        this.allStereotypes = {};

        diagram.getContents()
            .filter(e => e.type === OntoumlType.CLASS_VIEW)
            .forEach(classView => this.includeElement(this.allNodes, classView, model));
        
        diagram.getContents()
            .filter(e => (e.type === OntoumlType.RELATION_VIEW) || (e.type === OntoumlType.GENERALIZATION_VIEW))
            .forEach(relationView => {
                const relation = this.includeElement(this.allRelations, relationView, model);
                const sourceId = (relationView.type === OntoumlType.RELATION_VIEW) 
                    ? (relation.element as Relation).properties[0].propertyType.id
                    : (relation.element as Generalization).specific.id;
                const targetId = (relationView.type === OntoumlType.RELATION_VIEW) 
                    ? (relation.element as Relation).properties[1].propertyType.id
                    : (relation.element as Generalization).general.id;
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

     includeElement(elementMap: {}, element: DiagramElement, model: Package): ModelGraphNode {
         // @ts-ignore
        const modelElement = element.modelElement;
        if (elementMap[modelElement.id]) {
            elementMap[modelElement.id].representations.push(element);
        } else {
            const newNode = new ModelGraphNode(
                model.getElementById(modelElement.id) as ModelElement, 
                element
            );
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
        this.allViews[element.id] = element;
        return elementMap[modelElement.id];
     }

    createConnection(source: ModelGraphNode, target: ModelGraphNode) {
        source.outs.push(target);
        target.ins.push(source); 
    }

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
        // TODO
        diagram.contents = []; // Object.values(this.allViews).map(node => (node as OntoumlElement));
        return diagram;
    }

    /**
     * For debugging only
     */
    printNodeById(id: string) {
        console.log("Name: " + this.allNodes[id].element.getName());
        console.log("No. ins: " + this.allNodes[id].ins.length);
        console.log("No. outs: " + this.allNodes[id].outs.length);
    }

    changeId(map: {}, id: string, inElement: boolean) {
        let element = { ...map[id] };
        delete map[id];
        const newId = uniqid();
        if (inElement) {
            element.element.id = newId;
        } else {
            element.id = newId;
        }
        map[newId] = element;
    }

    updateAllIds() {
        const nodesKeys = Object.keys(this.allNodes);
        nodesKeys.forEach(id => this.changeId(this.allNodes, id, true))
        const relationKeys = Object.keys(this.allRelations);
        relationKeys.forEach(id => this.changeId(this.allRelations, id, true))
        const viewsKeys = Object.keys(this.allViews);
        viewsKeys.forEach(id => this.changeId(this.allViews, id, false))
    }

}