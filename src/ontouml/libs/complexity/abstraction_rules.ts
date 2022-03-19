import { ModelGraph, ModelGraphNode, AbstractionIssue } from ".";
import { Class, RelationStereotype, Property, Relation, stereotypeUtils, ClassView, OntoumlType, OntoumlElement } from "@libs/ontouml";
import uniqid from 'uniqid';


/**
 * Class that implements abstraction algorithm proposed in:
 *
 * Romanenko, E., Calvanese, D. and Guizzardi, G. (2022)
 * Ontology-Based Model Abstraction Reviewed.
 *
 * @author Elena Romanenko
 */


const PROPERTY_HEIGHT = 10;

export class AbstractionRules {
    graph: ModelGraph;
    issues: AbstractionIssue[];
    
    constructor(graph: ModelGraph) {
        this.graph = graph;
        this.issues = [];
    }

    // --------------------------------------------------------------------------------
    // Abstracting node functions
    // --------------------------------------------------------------------------------

    /**
     * Try to abstract from the given node as much as it is possible.
     * @param graphNode node from which we try to abstract
     * @returns modified ModelGraph
     */
    abstract(graphNode: ModelGraphNode) {
        // converge the node
        this.foldNode(graphNode);
        // if possible, abstract from it
        this.abstractNode(graphNode);
        // return updated graph
        return { graph: this.graph, issues: this.issues };
    }

    /**
     * Converge all depending relations to the node, 
     * i.e. sub- and part- classes will collapse to this node
     * @param graphNode node to be processed
     */
    foldNode(graphNode: ModelGraphNode) {
        // abstract from parts
        const partRelations = graphNode.ins.filter(inRelation => 
            stereotypeUtils.PartWholeRelationStereotypes.includes((inRelation.element as Relation).stereotype)
        )
        this.parthood(partRelations);

        // abstract from generalizations and generalization sets
        const generalizations = graphNode.ins.filter(inRelation => 
            inRelation.element.type === OntoumlType.GENERALIZATION_VIEW);
        const sets = graphNode.ins.filter(inRelation =>
            inRelation.element.type === OntoumlType.GENERALIZATION_SET_VIEW);
        this.hierarchy(generalizations, sets);
    }

    /**
     * Try to abstract from the given node
     * @param graphNode node to be processed
     */
    abstractNode(graphNode: ModelGraphNode) {
        console.log("Abstract from: " + graphNode.element.getName());
        
        // if this node doesn't have any relations, then just delete it
        if ((graphNode.ins.length === 0) && (graphNode.outs.length === 0)) {
            this.graph.removeNode(graphNode);
        } else if (stereotypeUtils.MomentOnlyStereotypes.includes((graphNode.element as Class).stereotype)) {
            // abstract from Moment
            this.abstractAspect(graphNode);
        } else {
            // abstract from Event or normal Type
            this.abstractType(graphNode);
        }
    }

    // Try to go upwards or downwards or find a partof
    abstractType(graphNode: ModelGraphNode){
        // TODO: abstract from general node
        this.issues.push(new AbstractionIssue(
            graphNode.element as OntoumlElement, 
            "Abstraction from " + graphNode.element.getName() + " is not possible."
        ));
    }

    // --------------------------------------------------------------------------------
    // Abstracting parthood functions
    // --------------------------------------------------------------------------------
    /**
     * Given a list of parthood relations, abstract from these relations
     * @param relations list of parthood relations
     */
    parthood(relations: ModelGraphNode[]) {
        console.log("Number of parthood relations: " + relations.length);
        
        relations?.forEach(relation => this.processParthood(relation));

        return { graph: this.graph, issues: this.issues };
    }

    /**
     * Parthood relation abstraction, tries to remove PartClass
     * @param relation parthood relation
     */
    processParthood(relation: ModelGraphNode){
        const wholeClass = relation.outs[0];
        const partClass = relation.ins[0];
        const stereotype = (relation.element as Relation).stereotype;
        let name = undefined;
        let roleName = partClass.element.getName();

        // converge part node, n.b. it is a recursive call
        this.foldNode(partClass);
        
        switch (stereotype) {
            case RelationStereotype.COMPONENT_OF:
                // make partClass a property of wholeClass
                let partProperty = new Property();
                partProperty.setName(partClass.element.getName());
                partProperty.id = uniqid();
                (wholeClass.element as Class).addAttribute(partProperty);
                wholeClass.representations.forEach(wholeView => 
                    (wholeView as ClassView).shape.setHeight(
                        (wholeView as ClassView).shape.getHeight() + PROPERTY_HEIGHT)
                );
                // do not create a role name
                roleName = undefined;
                // but be aware of relation name
                name = wholeClass.element.getName() + "'s " + partClass.element.getName() + " ";
            case RelationStereotype.SUBCOLLECTION_OF:
            case RelationStereotype.SUBQUANTITY_OF:
                const isReadOnly = (relation.element as Relation).properties[1].isReadOnly;
                this.graph.removeRelation(relation);
                this.processIns(partClass.ins, wholeClass, isReadOnly, name, roleName);
                this.processOuts(partClass.outs, wholeClass, isReadOnly, name, roleName);                
                this.graph.removeNode(partClass);
                break;
            case RelationStereotype.PARTICIPATIONAL:
                console.warn("There is no special rule for processing " + stereotype);
            case RelationStereotype.MEMBER_OF:
                console.log("Part class " + partClass.element.getName() + " will not be removed");
                break;
        }   
    }

    /**
     * 
     * N.B. by the time of calling relations are 'normal' relations only, no generalizations and no generalization sets
     * @param inRelations list of incoming relations
     * @param name WholeClass's PartClass
     * @param roleName PartClass name
     */
    processIns(inRelations: ModelGraphNode[], wholeClass: ModelGraphNode, 
               isReadOnly: boolean, name: string, roleName: string){
        inRelations.forEach(inRelation => {
            if (stereotypeUtils.MomentOnlyStereotypes.includes((inRelation.ins[0].element as Class).stereotype)) {
                // if relation is from Moment Type
                inRelation.moveRelationTo(wholeClass, roleName, false, false, true);
                (inRelation.element as Relation).properties[1].cardinality.setLowerBoundFromNumber(0);
            } else if (stereotypeUtils.isEventClassStereotype((inRelation.ins[0].element as Class).stereotype)) {
                // if relation is from Event, then check also for Termination + ReadOnly property
                if (((inRelation.element as Relation).stereotype != RelationStereotype.TERMINATION) || isReadOnly) {
                    inRelation.moveRelationTo(wholeClass, roleName, false, false, true);
                    (inRelation.element as Relation).properties[1].cardinality.setLowerBoundFromNumber(0);
                } else {
                    // if it is Termination relation and PartClass is not mandatory
                    this.graph.removeRelation(inRelation);
                }
            } else {
                // relation comes from any general class 
                if (name) {
                    if (inRelation.element.getName()) {
                        name =  name + inRelation.element.getName();
                    }
                    inRelation.element.setName(name);
                }   
                inRelation.moveRelationTo(wholeClass, roleName, false, false, true);
                (inRelation.element as Relation).properties[1].cardinality.setLowerBoundFromNumber(0);
            }
        })
    }

    processOuts(outRelations: ModelGraphNode[], wholeClass: ModelGraphNode, 
               isReadOnly: boolean, name: string, roleName: string) {
        outRelations.forEach(outRelation => {
            if (stereotypeUtils.MomentOnlyStereotypes.includes((outRelation.outs[0].element as Class).stereotype)) {
                // if relation is from Moment Type
                outRelation.moveRelationFrom(wholeClass, roleName, false, false, false, true);
                (outRelation.element as Relation).properties[0].cardinality.setUpperBoundFromNumber(1);
            } else if (stereotypeUtils.isEventClassStereotype((outRelation.outs[0].element as Class).stereotype)) {
                // if relation is from Event, then check also for Termination + ReadOnly property
                if (((outRelation.element as Relation).stereotype != RelationStereotype.TERMINATION) || isReadOnly) {
                    outRelation.moveRelationFrom(wholeClass, roleName, false, false, false, true);
                    (outRelation.element as Relation).properties[0].cardinality.setUpperBoundFromNumber(1);
                } else {
                    // if it is Termination relation and PartClass is not mandatory
                    this.graph.removeRelation(outRelation);                        
                }
            } else {
                // relation comes from any general class 
                if (name){
                    if (outRelation.element.getName()) {
                        name =  name + outRelation.element.getName();
                    }
                    outRelation.element.setName(name);
                }
                outRelation.moveRelationFrom(wholeClass, roleName, false, false, false, true);
                (outRelation.element as Relation).properties[0].cardinality.setUpperBoundFromNumber(1); 
            }
        })
    }

    // --------------------------------------------------------------------------------
    // Abstracting hierarchy functions
    // --------------------------------------------------------------------------------
    /**
     * Given lists of generalizations and generalizationsets, abstract UPWARDS from this
     * @param generalizations list of generalizations
     * @param sets list of generalization sets
     */
    hierarchy(generalizations: ModelGraphNode[], sets: ModelGraphNode[]) {
        console.log("Number of generalizations: " + generalizations.length);
        console.log("Number of generalization sets: " + sets.length);
        // TODO: complete for generalization sets
        // if there is a generalization
        // and it is disjoint and complete...

        generalizations?.forEach(generalization => this.processGeneralization(generalization));
        return { graph: this.graph, issues: this.issues}; 
    }

    processGeneralization(generalization: ModelGraphNode){
        const generalClass = generalization.outs[0];
        const specificClass = generalization.ins[0];
        let roleName = specificClass.element.getName();
        
        console.log("Processing generalization from " + specificClass.element.getName() + 
                    " to " + generalClass.element.getName());

        // converge specific node, n.b. it is a recursive call
        this.foldNode(specificClass);

        //move relations upwards
        specificClass.ins.forEach(inRelation => {
            inRelation.moveRelationTo(generalClass, roleName, true);
            (inRelation.element as Relation).properties[0].cardinality.setLowerBoundFromNumber(0);
        })

        specificClass.outs.forEach(outRelation => {
            outRelation.moveRelationFrom(generalClass, roleName, true, false, false, true);
        })
        
        this.graph.removeRelation(generalization);
        this.graph.removeNode(specificClass);
    }

    // --------------------------------------------------------------------------------
    // Abstracting aspects functions
    // --------------------------------------------------------------------------------
    /**
     * Given a list of aspects, abstract from them
     * @param moments list of aspect nodes
     */
     aspects(moments: ModelGraphNode[]) {
        console.log("Number of aspects: " + moments.length);
        
        moments?.forEach(moment => this.abstractAspect(moment));

        return { graph: this.graph, issues: this.issues };
    }

    /**
    * Abstract from the given moment node.
    * N.B. it is always possible, implements A1-A2 rules.
    * @param graphNode aspect node to be abstracted
    */
    abstractAspect(graphNode: ModelGraphNode) {
        this.foldNode(graphNode);

        const aspectRelations = graphNode.outs.filter(outRelation => {
            const stereotype = (outRelation.element as Relation).stereotype;
            return (stereotype === RelationStereotype.CHARACTERIZATION) 
                || (stereotype === RelationStereotype.MEDIATION)
        });

        // if there is where to move
        if (aspectRelations.length != 0){        
            // list of endurants to which we are going to add relations
            const endurants = aspectRelations.map(relation => relation.outs[0]);

            graphNode.outs.forEach(outRelation => {
                if (!aspectRelations.includes(outRelation) &&
                    ((outRelation.element as Relation).stereotype != RelationStereotype.EXTERNAL_DEPENDENCE)) {
                    endurants.forEach(endurant => this.graph.duplicateRelation(outRelation, endurant));
                }
            });

            graphNode.ins.forEach(inRelation => {
                if ((inRelation.element as Relation).stereotype === RelationStereotype.MANIFESTATION) {
                    endurants.forEach(endurant => this.graph.duplicateRelation(inRelation, endurant, inRelation.ins[0]));
                }
            });
        }

        // remove this node with all relations
        this.graph.removeNode(graphNode);
    }
    
}