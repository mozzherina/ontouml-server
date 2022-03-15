import { ModelGraph, ModelGraphNode } from ".";
import { Class, RelationStereotype, Property, Relation, stereotypeUtils, RelationView, ClassView } from "@libs/ontouml";
import uniqid from 'uniqid';


/**
 * Class that implements abstraction algorithm proposed in:
 *
 * Romanenko, E., Calvanese, D. and Guizzardi, G. (2022)
 * Ontology-Based Model Abstraction Reviewed.
 *
 * @author Elena Romanenko
 */


// interface AstractionRule {
//     rule
// }

const PROPERTY_HEIGHT = 10;

export class AbstractionRules {
    graph: ModelGraph;
    
    constructor(graph: ModelGraph) {
        this.graph = graph;
    }

    /**
     * Try to abstract from the given node as much as it is possible.
     * @param graphNode node from which we try to abstract
     * @returns modified ModelGraph
     */
    abstract(graphNode: ModelGraphNode): ModelGraph {
        // converge the node
        this.foldNode(graphNode);
        // if possible, abstract from it
        this.abstractNode(graphNode);
        // return updated graph
        return this.graph;
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
        this.graph = this.parthood(partRelations);

        // abstract from generalizations
        // TODO
    }

    /**
     * Try to abstract from the given node
     * ??? return possible issues
     * @param graphNode node to be processed
     */
    abstractNode(graphNode: ModelGraphNode) {
        console.log("Abstract from: " + graphNode.element.getName());
        // TODO
        // depending on Moment/Event/Object
    }

    // --------------------------------------------------------------------------------
    // Abstracting parthood functions
    // --------------------------------------------------------------------------------
    /**
     * Given a list of parthood relations, abstract from these relations
     * ??? empty list
     * @param relations list of parthood relations
     * @returns modified ModelGraph
     */
    parthood(relations: ModelGraphNode[]): ModelGraph {
        console.log("Number of parthood relations: " + relations.length);
        
        let deletedViews = [];
        relations?.forEach(relation => {
            deletedViews = [...deletedViews, ...this.processParthood(relation)];
        });
        // remove views of the deleted classes/relations
        Object.keys(this.graph.allViews)?.forEach(id => {
            const view = this.graph.allViews[id];
            if (deletedViews.includes((view as RelationView).modelElement.id)) {
                delete this.graph.allViews[id];
            }
        })
        return this.graph;
    }

    /**
     * Parthood relation abstraction, tries to remove PartClass
     * @param relation parthood relation
     * @returns list of views to be removed
     */
    processParthood(relation: ModelGraphNode): string[] {
        const wholeClass = relation.outs[0];
        const partClass = relation.ins[0];
        const stereotype = (relation.element as Relation).stereotype;
        let name = undefined;
        let roleName = partClass.element.getName();
        let deletedIds = [];

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
                deletedIds = [...deletedIds, 
                              ...this.processIns(partClass.ins, wholeClass, isReadOnly, name, roleName), 
                              ...this.processOuts(partClass.outs, wholeClass, isReadOnly, name, roleName)];                
                wholeClass.removeInRelation(relation);
                // remove unnecessary nodes
                delete this.graph.allNodes[partClass.element.id];
                delete this.graph.allRelations[relation.element.id];
                // return deleted ids for views cleaning
                return [...deletedIds, partClass.element.id, relation.element.id];
            case RelationStereotype.PARTICIPATIONAL:
                console.warn("There is no special rule for processing " + stereotype);
            case RelationStereotype.MEMBER_OF:
                console.log("Part class " + partClass.element.getName() + " will not be removed");
                return [];
        }   

        console.warn("New parthood stereotype was added: " + stereotype);
        return [];
    }

    /**
     * 
     * N.B. by the time of calling relations are 'normal' relations only, no generalizations and no generalization sets
     * @param inRelations list of incoming relations
     * @param name WholeClass's PartClass
     * @param roleName PartClass name
     * @returns list of views to be removed
     */
    processIns(inRelations: ModelGraphNode[], wholeClass: ModelGraphNode, 
               isReadOnly: boolean, name: string, roleName: string): string[] {
        let deletedIds = [];
        inRelations.forEach(inRelation => {
            if (stereotypeUtils.MomentOnlyStereotypes.includes((inRelation.ins[0].element as Class).stereotype)) {
                // if relation is from Moment Type
                inRelation.moveRelationTo(wholeClass, roleName, true, true);
                wholeClass.ins.push(inRelation);
            } else if (stereotypeUtils.isEventClassStereotype((inRelation.ins[0].element as Class).stereotype)) {
                // if relation is from Event, then check also for Termination + ReadOnly property
                if (((inRelation.element as Relation).stereotype != RelationStereotype.TERMINATION) || isReadOnly) {
                    inRelation.moveRelationTo(wholeClass, roleName, true, true);
                    wholeClass.ins.push(inRelation);
                } else {
                    // if it is Termination relation and PartClass is not mandatory
                    deletedIds = [...deletedIds, inRelation.element.id];
                    delete this.graph.allRelations[inRelation.element.id];                        
                }
            } else {
                // relation comes from any general class 
                if (name) {
                    if (inRelation.element.getName()) {
                        name =  name + inRelation.element.getName();
                    }
                    inRelation.element.setName(name);
                }   
                inRelation.moveRelationTo(wholeClass, roleName, true, true);
                wholeClass.ins.push(inRelation);
            }
        })
        return deletedIds;
    }

    processOuts(outRelations: ModelGraphNode[], wholeClass: ModelGraphNode, 
               isReadOnly: boolean, name: string, roleName: string): string[] {
        let deletedIds = [];
        outRelations.forEach(outRelation => {
            if (stereotypeUtils.MomentOnlyStereotypes.includes((outRelation.outs[0].element as Class).stereotype)) {
                // if relation is from Moment Type
                outRelation.moveRelationFrom(wholeClass, roleName, true, true);
                wholeClass.outs.push(outRelation);
            } else if (stereotypeUtils.isEventClassStereotype((outRelation.outs[0].element as Class).stereotype)) {
                // if relation is from Event, then check also for Termination + ReadOnly property
                if (((outRelation.element as Relation).stereotype != RelationStereotype.TERMINATION) || isReadOnly) {
                    outRelation.moveRelationFrom(wholeClass, roleName, true, true);
                    wholeClass.outs.push(outRelation);
                } else {
                    // if it is Termination relation and PartClass is not mandatory
                    deletedIds = [...deletedIds, outRelation.element.id];
                    delete this.graph.allRelations[outRelation.element.id];                        
                }
            } else {
                // relation comes from any general class 
                if (name){
                    if (outRelation.element.getName()) {
                        name =  name + outRelation.element.getName();
                    }
                    outRelation.element.setName(name);
                }
                outRelation.moveRelationFrom(wholeClass, roleName, true, true);
                wholeClass.outs.push(outRelation);
            }
        })
        return deletedIds;
    }
    // --------------------------------------------------------------------------------
    // -----------------END OF: Abstracting parthood functions-------------------------
    // --------------------------------------------------------------------------------

}