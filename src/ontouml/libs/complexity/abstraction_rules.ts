import { Class, ClassStereotype, Diagram, OntoumlType, Package, Property, Relation, RelationStereotype } from "@libs/ontouml";
import { cloneDeep } from 'lodash'
import uniqid from 'uniqid';
import { ModelGraph } from ".";


/**
 * Class that implements abstraction algorithm proposed in:
 *
 * Romanenko, E., Calvanese, D. and Guizzardi, G. (2022)
 * Ontology-Based Model Abstraction Reviewed.
 *
 * @author Elena Romanenko
 * 
 * All abstraction rules abstract active diagram only, and follow the same approach:
 * 1. determine those classes that need to be changed;
 * 2. create the reflection from old classes to new (also create a new model for these new classes);
 * 3. create a duplicate of the original diagram with new relations mapping to new classes;
 */


// interface AstractionRule {
//     rule
// }

export class AbstractionRules {
    graph: ModelGraph;
    diagram: Diagram; // original diagram
    model: Package; // original model
    relations: Relation[]; // all relations of the original diagram
    newDiagram: Diagram; // abstracted diagram
    newModel: Package; // abstracted model
    classesMap: {}; // old class's id -> new class hashMap

    constructor(model: Package, diagram: Diagram) {
        this.model = model;
        this.diagram = diagram;
        this.graph = new ModelGraph(cloneDeep(model), cloneDeep(diagram));
        const newName = "Abstract " + diagram.getName();
        this.newModel = this.graph.exportModel(newName);
        this.newDiagram = this.graph.exportDiagram(newName, this.newModel);
        
        // this.relations = this.getDiagramRelations();
        // this.newModel = this.makeNewModel(newName);
        // this.newDiagram = this.makeNewDiagram(newName);
        // this.classesMap = {};
    }

    makeNewModel(name: string): Package {
        let newModel = new Package();
        newModel.id = uniqid();
        newModel.setName(name); 
        return newModel;
    }

    makeNewDiagram(name: string): Diagram {
        let newDiagram = new Diagram();
        newDiagram.id = uniqid();
        newDiagram.setName(name);
        newDiagram.owner = this.newModel;
        newDiagram.contents = [];
        return newDiagram;
    }

    // --------------------------------------------------------------------------------
    // Relations functions
    // --------------------------------------------------------------------------------
    /**
     * Get all diagram's relations, also can left relations with specified stereotypes only
     * @param stereotypes filter for stereotype
     * @returns list of diagram's relations
     */
     getDiagramRelations(stereotypes: RelationStereotype[] = undefined): Relation[] {
        const relations = this.diagram?.getRealizedModelElements()
            .filter(relation => relation.type === OntoumlType.RELATION_TYPE) as Relation[];
        if (!stereotypes) {
            return relations;
        }
        return relations.filter(relation => stereotypes.includes(relation.stereotype));
    }

    /**
     * Returns in or out relations of the specified class
     * @param i === 1 => in
     * @param j === 1 => out
     * @param classId 
     * @param relationFilter filter for relations
     * @param classFilter stereotype filter for classes connected by the relations
     * @returns list of relations
     */
     filterRelations(i: number, j: number, classId: string, relationFilter: RelationStereotype[], 
        classFilter: ClassStereotype[]): Relation[]{
        let result = this.relations.filter(elem => elem.properties[i].propertyType.id === classId);
        if (relationFilter.length > 0) {
            result = result.filter(elem => relationFilter.includes(elem.stereotype));
        }
        if (classFilter.length > 0){
            result = result.filter(elem => classFilter.includes(
                this.model.getClassById(elem.properties[j].propertyType.id).stereotype));
        }
        return result;
    }

    getInRelations(classId: string, relationFilter: RelationStereotype[], 
        classFilter: ClassStereotype[]): Relation[] {
        return this.filterRelations(1, 0, classId, relationFilter, classFilter);
    }

    getOutRelations(classId: string, relationFilter: RelationStereotype[], 
        classFilter: ClassStereotype[]): Relation[] {
        return this.filterRelations(0, 1, classId, relationFilter, classFilter);
    }
    // --------------------------------------------------------------------------------
    // -----------------END OF: Relations functions------------------------------------
    // --------------------------------------------------------------------------------


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
    createDiagramElem(elem: { id: string; shape: { id: string; }}, diagramMap: {}): any {
        let newElem = cloneDeep(elem);
        newElem.id = uniqid();
        newElem.shape.id = newElem.id + "_shape";
        diagramMap[elem.id] = newElem.id;
        return newElem;
    }
    
    updateClasses(classId: string, newClass: Class, wholePartHash: {}) {
        wholePartHash[classId]?.forEach(
            ( elem: string ) => {
                this.classesMap[elem] = newClass;
                this.updateClasses(elem, newClass, wholePartHash);
                return;
            }
        );
    }
    
    createWholeClass(relationId: string, wholePartHash: {}) {
        const componentOf = this.model.getRelationById(relationId)
        const wholeClass = this.model.getClassById(componentOf.getSourceEnd().propertyType.id);
        const partClass = this.model.getClassById(componentOf.getTargetEnd().propertyType.id);

        // create new whole class with corresponding attribute
        let newClass = this.classesMap[wholeClass.id];
        if (!newClass){
            newClass = cloneDeep(wholeClass);
            newClass.id = uniqid();
            this.classesMap[wholeClass.id] = newClass;
        }
        let partProperty = new Property();
        partProperty.setName(partClass.getName());
        partProperty.id = uniqid();
        newClass.addAttribute(partProperty);
        
        // keep information about processed partClass
        this.updateClasses(partClass.id, newClass, wholePartHash);
        if (wholePartHash[wholeClass.id]) {
            wholePartHash[wholeClass.id].push(partClass.id);
        } else {
            wholePartHash[wholeClass.id] = [partClass.id];
        }
        this.classesMap[partClass.id] = newClass;
    }

    p2(_relations: Relation[]): Diagram {
        // if (relations.length === 0) {
        //     relations = this.getDiagramRelations([RelationStereotype.COMPONENT_OF]);
        // }   

        // // form a hash-table of relations that need to be processed before
        // // componentOf -> [incoming from MomentType relations or other parthood relations]
        // const relationsHash = {}
        // relations.forEach(relation => {
        //     const source = relation.getTargetEnd().propertyType.id;
        //     // get incomig relations from MomentTypes
        //     relationsHash[relation.id] = this.getInRelations(source, [], stereotypeUtils.MomentOnlyStereotypes);
        //     // get incoming parthood relations from other classes 
        //     // by this time should be componentOf relations only
        //     relationsHash[relation.id] = [ ...relationsHash[relation.id], 
        //         ...this.relations.filter(elem =>
        //             (elem.properties[0].propertyType.id === source) &&
        //             elem.properties[1].isAggregationEnd()
        //     )];
        // })
        
        // // sort relations into processing order
        // const relationsSort = this.topologySort(relationsHash);
       
        // // create new classes on the model
        // let wholePartHash = {};
        // relationsSort.forEach(relationId => this.createWholeClass(relationId, wholePartHash));
        // // add new classes to the model
        // let keptClasses = [];
        // (new Set(Object.values(this.classesMap))).forEach((newClass: Class )=> {
        //     this.newModel.contents.push(newClass);
        //     keptClasses.push(newClass.getName());
        // })

        // // move all to the new diagram
        // let diagramMap = {};
        // this.diagram.getClassViews().forEach(elem => {
        //         if (!Object.keys(this.classesMap).includes(elem.modelElement.id)){
        //             // if class wasn't changed
        //             this.newDiagram.contents.push(this.createDiagramElem(elem, diagramMap));
        //         } else if (keptClasses.includes(
        //             this.model.getElementById(elem.modelElement.id).getName()
        //         )) {
        //             // or it was kept
        //             let newClass = this.createDiagramElem(elem, diagramMap);
        //             newClass.modelElement = this.classesMap[newClass.modelElement.id];
        //             this.newDiagram.contents.push(newClass);
        //         }
        // });



        // this.diagram.contents.forEach((elem: { 
        //     id: string; 
        //     type: string; 
        //     shape: { id: string; }; 
        //     modelElement: { id: string; }
        // }) => {
        //     if ((elem.type === OntoumlType.RELATION_VIEW) || 
        //         (elem.type === OntoumlType.GENERALIZATION_VIEW)) {
        //         if 
                
        //         if (!Object.keys(this.classesMap).includes(elem.modelElement.id)){
        //             this.newDiagram.contents.push(this.createDiagramElem(elem, diagramMap));
        //         } else if (keptClasses.includes(
        //             this.model.getElementById(elem.modelElement.id).getName()
        //         )) {
        //             let newClass = this.createDiagramElem(elem, diagramMap);
        //             newClass.modelElement = this.classesMap[newClass.modelElement.id];
        //             this.newDiagram.contents.push(newClass);
        //         }
        //     } else {
        //         // if it is neither relation nor class
        //         this.newDiagram.contents.push(this.createDiagramElem(elem, diagramMap));
        //     }
        // });

        // push new model
        this.model.contents.push(this.newModel);

        return this.newDiagram;
    }
    // --------------------------------------------------------------------------------
    // -----------------END OF: Abstracting parthood functions-------------------------
    // --------------------------------------------------------------------------------

}