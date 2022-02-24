import { ClassStereotype, Diagram, ModelElement, OntoumlType, Package, Relation, RelationStereotype } from "@libs/ontouml";
import { cloneDeep } from 'lodash'
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
    diagram: Diagram;
    model: Package;
    newModel: ModelElement[];

    constructor(model: Package, diagram: Diagram) {
        this.model = model;
        this.diagram = this.makeDiagramCopy(diagram, "Abstract " + diagram.getName());
        console.log(diagram.getName());
    }

    makeDiagramCopy(oldDiagram: Diagram, name: string): Diagram {
        let diagram = cloneDeep(oldDiagram);
        diagram.id = uniqid();
        diagram.setName(name);
        diagram.contents.forEach(elem => {
            elem.id = uniqid();
            const shapeId = elem.id + "_shape";
            elem.shape.id = shapeId;
        });
        return diagram;
    }

    getDiagramRelations(): Relation[] {
        return this.diagram?.getRealizedModelElements()
            .filter(relation => relation.type === OntoumlType.RELATION_TYPE) as Relation[];
    }

    getDiagramRelationsByStereotype(stereotype: RelationStereotype): Relation[] {
        const relations = this.getDiagramRelations();
        return relations.filter(relation => relation.stereotype === stereotype);
    }

    getInRelations(targetId: string, includeAggregation: boolean, sourceTypes: ClassStereotype[]): Relation[] {
        let relations = this.getDiagramRelations();
        relations = relations.filter(elem => elem.properties[1].propertyType.id === targetId);
        return relations.filter(relation => {
            (includeAggregation && relation.properties[1].isAggregationEnd()) ||
            (this.model.getClassById(relation.properties[0].propertyType.id).stereotype in sourceTypes)
        });
    }

    p2(relations: Relation[]): Diagram {
        if (relations.length === 0) {
            relations = this.getDiagramRelationsByStereotype(RelationStereotype.COMPONENT_OF)
        }
        //form a hash-table of relations to be processed before
        const relationsHash = {}
        relations.forEach(relation => {
            const source = relation.getSourceEnd().propertyType.id;
            relationsHash[relation.id] = this.getInRelations(source, true, 
                [ClassStereotype.MODE, ClassStereotype.RELATOR, ClassStereotype.QUALITY]
            );
        })
        console.log("relations check");
        //componentIdsHash[id] = 

        //iteratively-recursively process the table by updating the links
        // also: remove or update some elements
        // update the model

        // let isValid = true
        // while (this.isP2P3Applicable(diagram, model)) {
        //     let abstraction = new Module('P2 Abstraction');

        //     const allClasses = this.project.getAllClasses();
        
        //     const relators = this.project.getAllClassesByStereotype(ClassStereotype.RELATOR);
        
        //     const relations = this.project.getAllRelations();

        //     for (let i = relators.length - 1; i >= 0; i--) {
        //         /**2 */
        //         for (let j = relations.length - 1; j >= 0; j--) {
        //           if (!relations[j].isDerived) {
        //             if (relations[j].getSourceClass() == relators[i] || relations[j].getTargetClass() == relators[i]) {
        //               relations.splice(j, 1);
        //             }
        //           }
        //         }
        //     }
          
        //     /**3 */
        //     var index = allClasses.indexOf(relators[i]);
        //     console.log('Remover ' + relators[i].getName() + ' no indice ' + index);
        //     allClasses.splice(index, 1);
        // }
        return this.diagram;
    }
}
