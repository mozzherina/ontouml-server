import { DiagramElement, ModelElement, Relation, Class, RelationView, ClassView, Point, Property } from "@libs/ontouml";

export enum CardinalityOptions {
    NONE,
    RESET,
    SET_UPPER_1,
    SET_LOWER_0
}

export class ModelGraphNode {
    element: ModelElement;
    representations: DiagramElement[];
    ins: ModelGraphNode[];
    outs: ModelGraphNode[];

    constructor(element: ModelElement, representation: DiagramElement[]) {
        this.element = element;
        this.representations = representation;
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
     * Set up cardinality for relation end
     * @param relationEnd relation end's properties
     * @param cardinalityOpt cardinality options changes
     */
    setCardinality(relationEnd: Property, cardinalityOpt: CardinalityOptions) {
        switch (cardinalityOpt) {
            case CardinalityOptions.RESET:
                relationEnd.cardinality.setZeroToMany();
                break;
            case CardinalityOptions.SET_UPPER_1:
                if (relationEnd.cardinality.getUpperBoundAsNumber() > 1) {
                    relationEnd.cardinality.setUpperBoundFromNumber(1);
                }
                break;
            case CardinalityOptions.SET_LOWER_0:
                if (relationEnd.cardinality.getLowerBoundAsNumber() > 0) {
                    relationEnd.cardinality.setLowerBoundFromNumber(0);
                }
                break;
        }
    }

    /**
     * Moves relation to a new target, also changes cardinality
     * @param newOut new target class
     * @param roleName role name for target class
     * @param keepOldRole if true the existing role would be kept
     * @param cardinalityTo change 'to' cardinality
     * @param cardinalityFrom change 'from' cardinality
     */
    moveRelationTo(
        origin: ModelGraphNode,
        newOut: ModelGraphNode, 
        roleName: string = undefined, 
        keepOldRole: boolean = true,
        cardinalityTo = CardinalityOptions.NONE,
        cardinalityFrom = CardinalityOptions.NONE
    ) {
        this.outs[0].removeInRelation(this);
        this.outs[0] = newOut;
        newOut.ins.push(this);
        
        // change link in properties section
        let propFrom = (this.element as Relation).properties[0];
        propFrom.propertyType = (origin.element as Class); 
        let propTo = (this.element as Relation).properties[1];
        propTo.propertyType = (newOut.element as Class);

        // set up cardinality
        this.setCardinality(propFrom, cardinalityFrom);
        this.setCardinality(propTo, cardinalityTo);

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
     * @param cardinalityFrom change 'from' cardinality
     * @param cardinalityTo change 'to' cardinality
     */
    moveRelationFrom(
        origin: ModelGraphNode,
        newIn: ModelGraphNode, 
        roleName: string = undefined, 
        keepOldRole: boolean = true,
        cardinalityFrom = CardinalityOptions.NONE,
        cardinalityTo = CardinalityOptions.NONE
    ) {
        this.ins[0].removeOutRelation(this);
        this.ins[0] = newIn;
        newIn.outs.push(this);
        
        // change link in properties section
        let propFrom = (this.element as Relation).properties[0];
        propFrom.propertyType = (newIn.element as Class);
        let propTo = (this.element as Relation).properties[1];
        propTo.propertyType = (origin.element as Class); 
        
        // set up cardinality
        this.setCardinality(propFrom, cardinalityFrom);
        this.setCardinality(propTo, cardinalityTo);

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
