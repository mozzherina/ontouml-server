import { DiagramElement, ModelElement, Relation, Class, RelationView, ClassView, Point } from "@libs/ontouml";

export class ModelGraphNode {
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

    removeInRelation(relation: ModelGraphNode) {
        const index = this.ins.indexOf(relation);
        if (index > -1) {
            this.ins.splice(index, 1);
        }
    }
    
    removeOutRelation(relation: ModelGraphNode) {
        const index = this.outs.indexOf(relation);
        if (index > -1) {
            this.outs.splice(index, 1);
        }
    }

    moveRelationTo(newOut: ModelGraphNode, roleName: string, 
                   setUpperCardinality: boolean, setLowerCardinality: boolean) {
        this.outs[0] =  newOut;
        // change link in properties section
        let propTo = (this.element as Relation).properties[1];
        let propFrom = (this.element as Relation).properties[0];
        propTo.propertyType = newOut.element as Class;

        // set up cardinality
        if (setUpperCardinality && (propTo.cardinality.getUpperBoundAsNumber() > 1)) {
            propTo.cardinality.setUpperBoundFromNumber(1);
        }
        if (setLowerCardinality && (propFrom.cardinality.getLowerBoundAsNumber() > 0)) {
            propFrom.cardinality.setLowerBoundFromNumber(0);
        }

        // add role name
        if (roleName) {
            propTo.setName(roleName);
        }

        // change all representations
        const classView = newOut.representations[0] as ClassView
        const targetPoint = new Point(
            classView.shape.topLeft.x + (classView.shape.getWidth()/2>>0), 
            classView.shape.topLeft.y + classView.shape.getHeight());
        this.representations.forEach(relView => {
            (relView as RelationView).target = classView;
            (relView as RelationView).shape.points = [
                ...(relView as RelationView).shape.points.slice(0, -1), 
                targetPoint
            ];
        });
    }

    moveRelationFrom(newIn: ModelGraphNode, roleName: string, 
                     setUpperCardinality: boolean, setLowerCardinality: boolean) {
        this.ins[0] =  newIn;
        // change link in properties section
        let propTo = (this.element as Relation).properties[1];
        let propFrom = (this.element as Relation).properties[0];
        propFrom.propertyType = newIn.element as Class;

        // set up cardinality
        if (setUpperCardinality && (propTo.cardinality.getUpperBoundAsNumber() > 1)) {
            propTo.cardinality.setUpperBoundFromNumber(1);
        }
        if (setLowerCardinality && (propFrom.cardinality.getLowerBoundAsNumber() > 0)) {
            propFrom.cardinality.setLowerBoundFromNumber(0);
        }

        // add role name
        if (roleName) {
            propFrom.setName(roleName);
        }

        // change all representations
        const classView = newIn.representations[0] as ClassView
        const targetPoint = new Point(
            classView.shape.topLeft.x + (classView.shape.getWidth()/2>>0), 
            classView.shape.topLeft.y + classView.shape.getHeight());
        this.representations.forEach(relView => {
            (relView as RelationView).source = classView;
            (relView as RelationView).shape.points = [
                targetPoint, 
                ...(relView as RelationView).shape.points.slice(1)
            ];
        });
        // TODO: update representation path
    }
}
