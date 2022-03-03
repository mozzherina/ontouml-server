import { Relation } from "@libs/ontouml";
import { ModelGraph } from ".";


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
    p2(_relations: Relation[]): ModelGraph {
        return this.graph;
    }
    // --------------------------------------------------------------------------------
    // -----------------END OF: Abstracting parthood functions-------------------------
    // --------------------------------------------------------------------------------

}