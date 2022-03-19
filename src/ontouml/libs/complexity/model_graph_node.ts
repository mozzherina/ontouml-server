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

    /**
     * Deletes incoming edge by reference
     * @param relation reference to the relation
     */
    removeInRelation(relation: ModelGraphNode) {
        const index = this.ins.indexOf(relation);
        if (index > -1) {
            this.ins.splice(index, 1);
        }
    }
    
    /**
     * Deletes outgoing edge by reference
     * @param relation reference fo the relation
     */
    removeOutRelation(relation: ModelGraphNode) {
        const index = this.outs.indexOf(relation);
        if (index > -1) {
            this.outs.splice(index, 1);
        }
    }

    /**
     * Moves relation to a new target, also changes cardinality on this side
     * @param newOut new target class
     * @param roleName role name for target class
     * @param keepOldRole if true the existing role would be kept
     * @param resetCardinality set cardinality to *
     * @param setUpperCardinality set upper cardinality to 1
     * @param relaxLowerCardinality set lower cardinality to 0
     */
    moveRelationTo(
        newOut: ModelGraphNode, 
        roleName: string = undefined, 
        keepOldRole: boolean = true,
        resetCardinality: boolean = false,
        setUpperCardinality: boolean = false, 
        relaxLowerCardinality: boolean = false
    ) {
        this.outs[0].removeInRelation(this);
        this.outs[0] =  newOut;
        newOut.ins.push(this);
        
        // change link in properties section
        let propTo = (this.element as Relation).properties[1];
        propTo.propertyType = (newOut.element as Class);

        // set up cardinality
        if (resetCardinality) { propTo.cardinality.setZeroToMany(); }
        if (setUpperCardinality && (propTo.cardinality.getUpperBoundAsNumber() > 1)) {
            propTo.cardinality.setUpperBoundFromNumber(1);
        }
        if (relaxLowerCardinality && (propTo.cardinality.getLowerBoundAsNumber() > 0)) {
            propTo.cardinality.setLowerBoundFromNumber(0);
        }

        // add role name if given
        if (roleName != undefined) {
            if (!keepOldRole || !propTo.getName()) {
                propTo.setName(roleName);
            }
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

    /**
     * Move relation to the new source class
     * @param newIn new source class
     * @param roleName role name for target class
     * @param keepOldRole if true the existing role would be kept
     * @param resetCardinality set cardinality to *
     * @param setUpperCardinality set upper cardinality to 1
     * @param relaxLowerCardinality set lower cardinality to 0
     */
    moveRelationFrom(
        newIn: ModelGraphNode, 
        roleName: string = undefined, 
        keepOldRole: boolean = true,
        resetCardinality: boolean = false,
        setUpperCardinality: boolean = false, 
        relaxLowerCardinality: boolean = false
    ) {
        this.ins[0].removeOutRelation(this);
        this.ins[0] =  newIn;
        newIn.outs.push(this);
        
        // change link in properties section
        let propFrom = (this.element as Relation).properties[0];
        propFrom.propertyType = (newIn.element as Class);

        // set up cardinality
        if (resetCardinality) { propFrom.cardinality.setZeroToMany(); }
        if (setUpperCardinality && (propFrom.cardinality.getUpperBoundAsNumber() > 1)) {
            propFrom.cardinality.setUpperBoundFromNumber(1);
        }
        if (relaxLowerCardinality && (propFrom.cardinality.getLowerBoundAsNumber() > 0)) {
            propFrom.cardinality.setLowerBoundFromNumber(0);
        }

        // add role name if given
        if (roleName != undefined) {
            if (!keepOldRole || !propFrom.getName()) {
                propFrom.setName(roleName);
            }
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
    }
}
