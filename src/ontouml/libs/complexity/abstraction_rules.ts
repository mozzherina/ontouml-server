import { ModelGraph, ModelGraphNode } from ".";
import { Class, RelationStereotype, Property, Relation, stereotypeUtils, OntoumlType, RelationView } from "@libs/ontouml";
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

export class AbstractionRules {
    graph: ModelGraph;
    
    constructor(graph: ModelGraph) {
        this.graph = graph;
    }

    // --------------------------------------------------------------------------------
    // Abstracting parthood functions
    // --------------------------------------------------------------------------------
    processComponentOf(relation: ModelGraphNode): string[] {
        const wholeClass = relation.outs[0];
        const partClass = relation.ins[0];
        let name = wholeClass.element.getName() + "'s " + partClass.element.getName();
        let deletedIds = [];
        
        // making partClass a property of wholeClass
        let partProperty = new Property();
        partProperty.setName(partClass.element.getName());
        partProperty.id = uniqid();
        (wholeClass.element as Class).addAttribute(partProperty);

        // go deep if there is another componentOf relation of the partClass
        partClass.ins.forEach(inRelation => {
            if ((inRelation.element as Relation).stereotype === RelationStereotype.COMPONENT_OF) {
                deletedIds = [...deletedIds, ...this.processComponentOf(inRelation)];
            }
        }); 
            
        partClass.ins.forEach(inRelation => {
            if (inRelation.element.type === OntoumlType.RELATION_TYPE) {
                // we are going to keep only 'normal' relations, no generalizations and no generalization sets
                if (stereotypeUtils.MomentOnlyStereotypes.includes((inRelation.ins[0].element as Class).stereotype)) {
                    // if relation is from Moment Type => apply p2
                    inRelation.moveRelationTo(wholeClass);
                    wholeClass.ins.push(inRelation);
                } else if (stereotypeUtils.isEventClassStereotype((inRelation.ins[0].element as Class).stereotype)) {
                    // if relation is from Event
                    // check also for Termination + ReadOnly property
                    if (((inRelation.element as Relation).stereotype != RelationStereotype.TERMINATION) 
                        || (relation.element as Relation).properties[1].isReadOnly) {
                        inRelation.moveRelationTo(wholeClass);
                        wholeClass.ins.push(inRelation);
                    } else {
                        // otherwise delete it
                        deletedIds = [...deletedIds, inRelation.element.id];
                        delete this.graph.allRelations[inRelation.element.id];                        
                    }
                } else {
                    // relation comes from any general class 
                    if (inRelation.element.getName()) {
                        name =  name + " " + inRelation.element.getName();
                    }
                    inRelation.element.setName(name);
                    inRelation.moveRelationTo(wholeClass);
                    wholeClass.ins.push(inRelation);
                }
            } else {
                // otherwise delete it
                deletedIds = [...deletedIds, inRelation.element.id];
                delete this.graph.allRelations[inRelation.element.id]; 
            }
        })

        partClass.outs.forEach(outRelation => {
            if ((outRelation.element.type === OntoumlType.RELATION_TYPE) &&
                ((outRelation.element as Relation).stereotype != RelationStereotype.COMPONENT_OF)) {
                if (stereotypeUtils.MomentOnlyStereotypes.includes((outRelation.outs[0].element as Class).stereotype)) {
                    // if relation is to Moment Type => print notification
                    console.log("Object " + partClass.element.getName() 
                                + " has an out relation to the Aspect");
                    // and delete it
                    deletedIds = [...deletedIds, outRelation.element.id];
                    delete this.graph.allRelations[outRelation.element.id];
                } else if (stereotypeUtils.isEventClassStereotype((outRelation.outs[0].element as Class).stereotype)) {
                    // if relation is participation in the Event
                    if ((outRelation.element as Relation).stereotype === RelationStereotype.PARTICIPATION) {
                        outRelation.moveRelationFrom(wholeClass);
                        wholeClass.outs.push(outRelation);
                    } else {
                        // otherwise delete it
                        deletedIds = [...deletedIds, outRelation.element.id];
                        delete this.graph.allRelations[outRelation.element.id];
                    }
                } else {
                    // relation goes to any general class 
                    if (outRelation.element.getName()) {
                        name =  name + " " + outRelation.element.getName();
                    }
                    outRelation.element.setName(name);
                    outRelation.moveRelationFrom(wholeClass);
                    wholeClass.outs.push(outRelation);
                }
            }
        })
        
        wholeClass.removeInRelation(relation);
        // remove unnecessary nodes
        delete this.graph.allNodes[partClass.element.id];
        delete this.graph.allRelations[relation.element.id];
        // return deleted ids for views cleaning
        return [...deletedIds, partClass.element.id, relation.element.id];
    }
    
    
    p2(relations: ModelGraphNode[]): ModelGraph {
        let deletedViews = [];
        relations?.forEach(relation => {
            deletedViews = [...deletedViews, ...this.processComponentOf(relation)];
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
    // --------------------------------------------------------------------------------
    // -----------------END OF: Abstracting parthood functions-------------------------
    // --------------------------------------------------------------------------------

}