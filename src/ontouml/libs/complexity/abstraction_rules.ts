import { ModelGraph, ModelGraphNode, AbstractionIssue } from ".";
import { Class, RelationStereotype, Property, Relation, stereotypeUtils, ClassView, OntoumlType, AggregationKind } from "@libs/ontouml";
import uniqid from 'uniqid';
import { CardinalityOptions } from "./model_graph_node";


/**
 * Class that implements abstraction algorithm proposed in:
 *
 * Romanenko, E., Calvanese, D. and Guizzardi, G. (2022)
 * Abstracting Ontology-Driven Conceptual Models:
 * Objects, Aspects, Events, and their Parts
 * In: Proc. of Int. Conf. on Research Challenges in Inf. Sc. (RCIS'22)
 *
 * @author Elena Romanenko
 */


const PROPERTY_HEIGHT = 10;

export class AbstractionRules {
    graph: ModelGraph;
    issues: AbstractionIssue[];
    folded: ModelGraphNode[];
    
    constructor(graph: ModelGraph) {
        this.graph = graph;
        this.issues = [];
        this.folded = [];  
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
        // TODO: decide if this is needed
        // if possible, abstract from it
        // this.abstractNode(graphNode);
        // return updated graph
        return { graph: this.graph, issues: this.issues };
    }

    /**
     * Converge all depending relations to the node, 
     * i.e. sub- and part- classes will collapse to this node
     * @param graphNode node to be processed
     */
    foldNode(graphNode: ModelGraphNode) {
        if (this.folded.lastIndexOf(graphNode) > -1) { return; }
        
        // debug
        console.log("Converges node: " + graphNode.element.getName());
        // -----

        // abstract from parts
        const partRelations = graphNode.ins.filter(inRelation => 
                // TODO: remove this, when error with composition ends is fixed
                stereotypeUtils.PartWholeRelationStereotypes.includes((inRelation.element as Relation).stereotype) 
                // TODO: change this to 1, when error with composition ends is fixed
                // TODO: check if properties is defined
                || (inRelation.element as Relation).properties[0].aggregationKind === AggregationKind.COMPOSITE
            );
        this.parthood(partRelations);

        // abstract from generalizations and generalization sets
        const generalizations = graphNode.ins.filter(inRelation => 
            inRelation.element.type === OntoumlType.GENERALIZATION_TYPE);
        const sets = graphNode.ins.filter(inRelation =>
            inRelation.element.type === OntoumlType.GENERALIZATION_SET_TYPE);
        this.hierarchy(generalizations, sets);

        // debug
        console.log("End processing node: " + graphNode.element.getName());
        // -----

        this.folded.push(graphNode);
    }

    /**
     * Try to abstract from the given node
     * @param graphNode node to be processed
     */
    // abstractNode(graphNode: ModelGraphNode) {
    //     console.log("Abstract from: " + graphNode.element.getName());
    //     // if this node doesn't have any relations, then just delete it
    //     if ((graphNode.ins.length === 0) && (graphNode.outs.length === 0)) {
    //         this.graph.removeNode(graphNode);
    //     } else if (stereotypeUtils.MomentOnlyStereotypes.includes((graphNode.element as Class).stereotype)) {
    //         // abstract from Moment
    //         this.abstractAspect(graphNode);
    //     } else {
    //         // abstract from Event or normal Type
    //         this.abstractType(graphNode);
    //     }
    // }

    // Try to go upwards or downwards or find a partof
    // abstractType(graphNode: ModelGraphNode){
    //     // TODO: abstract from general node
    //     this.issues.push(new AbstractionIssue(
    //         graphNode.element as OntoumlElement, 
    //         "Abstraction from " + graphNode.element.getName() + " is not possible."
    //     ));
    // }

    // --------------------------------------------------------------------------------
    // Abstracting parthood functions
    // --------------------------------------------------------------------------------
    /**
     * Given a list of parthood relations, abstract from these relations
     * @param relations list of parthood relations
     */
    parthood(relations: ModelGraphNode[]) {
        console.log("Number of parthood relations: " + relations.length);
        
        // list of processed nodes
        relations?.forEach(relation => this.processParthood(relation));

        return { graph: this.graph, issues: this.issues };
    }

    /**
     * Parthood relation abstraction, tries to remove PartClass
     * @param relation parthood relation
     */
    processParthood(relation: ModelGraphNode) {
        const wholeClass = relation.outs[0];
        const partClass = relation.ins[0];
        let stereotype = (relation.element as Relation).stereotype;
        // for normal partOf
        if (!stereotype) { stereotype = RelationStereotype.SUBQUANTITY_OF; }
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
                // and continue to move relations
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
     * Move incoming relation to the WholeClass
     * N.B. by the time of calling relations are 'normal' relations only, no generalizations and no generalization sets
     * @param inRelations list of incoming relations
     * @param wholeClass link to the WholeClass
     * @param isReadOnly check if partClass was mandatory
     * @param name WholeClass's PartClass
     * @param roleName PartClass name
     */
    processIns(inRelations: ModelGraphNode[], wholeClass: ModelGraphNode, 
               isReadOnly: boolean, name: string, roleName: string){
        while (inRelations.length > 0) {
        //inRelations.forEach(inRelation => {
            if (stereotypeUtils.MomentOnlyStereotypes.includes((inRelations[0].ins[0].element as Class).stereotype)) {
                // if relation is from Moment Type
                inRelations[0].moveRelationTo(inRelations[0].ins[0], wholeClass, roleName, 
                        false, CardinalityOptions.SET_UPPER_1, CardinalityOptions.SET_LOWER_0);
            } else if (stereotypeUtils.isEventClassStereotype((inRelations[0].ins[0].element as Class).stereotype)) {
                // if relation is from Event, then check also for Termination + ReadOnly property
                if (((inRelations[0].element as Relation).stereotype != RelationStereotype.TERMINATION) || isReadOnly) {
                    inRelations[0].moveRelationTo(inRelations[0].ins[0], wholeClass, roleName, 
                            false, CardinalityOptions.SET_UPPER_1, CardinalityOptions.SET_LOWER_0);
                } else {
                    // if it is Termination relation and PartClass is not mandatory
                    this.graph.removeRelation(inRelations[0]);
                }
            } else {
                // relation comes from any general class 
                if (name) {
                    if (inRelations[0].element.getName()) {
                        name =  name + inRelations[0].element.getName();
                    }
                    inRelations[0].element.setName(name);
                }   
                inRelations[0].moveRelationTo(inRelations[0].ins[0], wholeClass, roleName, 
                        false, CardinalityOptions.SET_UPPER_1, CardinalityOptions.SET_LOWER_0);
            }
        } //)
    }

    /**
     * Move outcoming relation to the WholeClass
     * N.B. by the time of calling relations are 'normal' relations only, no generalizations and no generalization sets
     * @param outRelations list of incoming relations
     * @param wholeClass link to the WholeClass
     * @param isReadOnly check if partClass was mandatory
     * @param name WholeClass's PartClass
     * @param roleName PartClass name
     */
    processOuts(outRelations: ModelGraphNode[], wholeClass: ModelGraphNode, 
               isReadOnly: boolean, name: string, roleName: string) {
        while (outRelations.length > 0) {
            if (stereotypeUtils.MomentOnlyStereotypes.includes((outRelations[0].outs[0].element as Class).stereotype)) {
                // if relation is from Moment Type
                outRelations[0].moveRelationFrom(outRelations[0].outs[0], wholeClass, roleName, 
                        false, CardinalityOptions.SET_UPPER_1, CardinalityOptions.SET_LOWER_0);
            } else if (stereotypeUtils.isEventClassStereotype((outRelations[0].outs[0].element as Class).stereotype)) {
                // if relation is from Event, then check also for Termination + ReadOnly property
                if (((outRelations[0].element as Relation).stereotype != RelationStereotype.TERMINATION) || isReadOnly) {
                    outRelations[0].moveRelationFrom(outRelations[0].outs[0], wholeClass, roleName, 
                            false, CardinalityOptions.SET_UPPER_1, CardinalityOptions.SET_LOWER_0);
                } else {
                    // if it is Termination relation and PartClass is not mandatory
                    this.graph.removeRelation(outRelations[0]);                        
                }
            } else {
                // relation comes from any general class 
                if (name){
                    if (outRelations[0].element.getName()) {
                        name =  name + outRelations[0].element.getName();
                    }
                    outRelations[0].element.setName(name);
                }
                outRelations[0].moveRelationFrom(outRelations[0].outs[0], wholeClass, roleName, 
                        false, CardinalityOptions.SET_UPPER_1, CardinalityOptions.SET_LOWER_0);
            }
        }
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

    processGeneralization(generalization: ModelGraphNode) {
        const generalClass = generalization.outs[0];
        const specificClass = generalization.ins[0];
        let roleName = specificClass.element.getName();
        
        console.log("Processing generalization from " + specificClass.element.getName() + 
                    " to " + generalClass.element.getName());

        // converge specific node, n.b. it is a recursive call
        this.foldNode(specificClass);

        //move relations upwards
        specificClass.ins
            .filter(inRelation => 
                        inRelation.element.type != OntoumlType.GENERALIZATION_TYPE
                        && inRelation.element.type != OntoumlType.GENERALIZATION_SET_TYPE)
            .forEach(inRelation => {
                        inRelation.moveRelationTo(inRelation.ins[0], generalClass, 
                                roleName, true, CardinalityOptions.NONE, CardinalityOptions.SET_LOWER_0);
                })

        specificClass.outs
            .filter(outRelation => 
                        outRelation.element.type != OntoumlType.GENERALIZATION_TYPE
                        && outRelation.element.type != OntoumlType.GENERALIZATION_SET_TYPE)
            .forEach(outRelation => {
                        outRelation.moveRelationFrom(outRelation.outs[0], generalClass, 
                                roleName, true,  CardinalityOptions.SET_LOWER_0);
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
                if (!aspectRelations.includes(outRelation) 
                    && ((outRelation.element as Relation).stereotype != RelationStereotype.EXTERNAL_DEPENDENCE)
                    && !stereotypeUtils.isEventClassStereotype((outRelation.outs[0].element as Class).stereotype)
                    && !stereotypeUtils.isSituationClassStereotype((outRelation.outs[0].element as Class).stereotype)
                ) {
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