import { ModelGraph, ModelGraphNode } from ".";
import { Class, RelationStereotype, Property, Relation, stereotypeUtils, OntoumlType, RelationView, ClassView } from "@libs/ontouml";
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
    // Topology sort of the relations into processing order
    // --------------------------------------------------------------------------------
    includesAll(value: string, result: string[], hash: {}) {
        if (result.includes(value)) { return; }
        if (Object.keys(hash).includes(value)) {
            hash[value].forEach((key: { id: string; }) => this.includesAll(key.id, result, hash))
            result.push(value);
        }
        //result.push(value);
        return;
    }

    topologySort(relationsHash: {}): string[] {
        let result = [];
        Object.keys(relationsHash).forEach(key => {
            if (!result.includes(key)) {
                relationsHash[key].forEach((value: { id: string; }) =>
                    this.includesAll(value.id, result, relationsHash)
                );
                result.push(key);
            }
        });
        return result;
    }
    // --------------------------------------------------------------------------------
    // -----------------END OF: Topology sort------------------------------------------
    // --------------------------------------------------------------------------------


    // --------------------------------------------------------------------------------
    // Abstracting parthood functions
    // --------------------------------------------------------------------------------
    moveRelation(source: ModelGraphNode, _target: ModelGraphNode, where: ModelGraphNode, 
            _subRelation: ModelGraphNode, _relation: ModelGraphNode, _name: string) {
        if (stereotypeUtils.MomentOnlyStereotypes.includes((source.element as Class).stereotype)) {
            _target =  where;
            _subRelation.representations.forEach(relView => {
                (relView as RelationView).target = where.representations[0] as ClassView;
            });
        } 
        /*else if (stereotypeUtils.isEventClassStereotype((source.element as Class).stereotype)) {
            if (((subRelation.element as Relation).stereotype != RelationStereotype.TERMINATION) 
                || (relation.element as Relation).properties[1].isReadOnly) {
                _target = where;
            }
        } else {
            subRelation.element.setName(name);
            _target = where;
        }*/
    }
    
    processComponentOf(relation: ModelGraphNode): string[] {
        const wholeClass = relation.outs[0];
        const partClass = relation.ins[0];
        let name = wholeClass.element.getName() + "'s " 
                + partClass.element.getName();
        
        let partProperty = new Property();
        partProperty.setName(partClass.element.getName());
        partProperty.id = uniqid();
        (wholeClass.element as Class).addAttribute(partProperty);

        partClass.ins.forEach(inRelation => {
            if ((inRelation.element as Relation).stereotype === RelationStereotype.COMPONENT_OF) {
                this.processComponentOf(inRelation);
            } else if (inRelation.element.type === OntoumlType.RELATION_TYPE) {
                if (inRelation.element.getName()) {
                    name =  name + " " + inRelation.element.getName();
                }
                //this.moveRelation(inRelation.ins[0], inRelation.outs[0], wholeClass, 
                //    inRelation, relation, name);
                if (stereotypeUtils.MomentOnlyStereotypes.includes((inRelation.ins[0].element as Class).stereotype)) {
                    inRelation.outs[0] =  wholeClass;
                    (inRelation.element as Relation).properties[1].propertyType = wholeClass.element as Class;
                    inRelation.representations.forEach(relView => {
                        (relView as RelationView).target = wholeClass.representations[0] as ClassView;
                    });
                }
            }
        })

        /*
        partClass.outs.forEach(outRelation => {
            if ((outRelation.element as Relation).stereotype != RelationStereotype.COMPONENT_OF) {
                if (outRelation.element.getName()) {
                    name =  name + " " + outRelation.element.getName();
                }
                this.moveRelation(outRelation.outs[0], outRelation.ins[0], wholeClass, 
                    outRelation, relation, name);
            }
        })*/
        
        delete this.graph.allNodes[partClass.element.id];
        delete this.graph.allRelations[relation.element.id];
        return [partClass.element.id, relation.element.id];
    }
    
    
    p2(relations: ModelGraphNode[]): ModelGraph {
        relations.forEach(relation => {
            const deletedIds = this.processComponentOf(relation);
            Object.keys(this.graph.allViews).forEach(id => {
                const view = this.graph.allViews[id];
                if (deletedIds.includes((view as RelationView).modelElement.id)) {
                    delete this.graph.allViews[id];
                }
            })
        });
        return this.graph;
        //return null;
    }
    // --------------------------------------------------------------------------------
    // -----------------END OF: Abstracting parthood functions-------------------------
    // --------------------------------------------------------------------------------

}