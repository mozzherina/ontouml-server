import { Project, stereotypeUtils, OntoumlType } from '@libs/ontouml'; 
import { Service } from '@libs/service';
import { ServiceIssue } from '@libs/service_issue';
import { AbstractionOptions } from './options';
import { AbstractionRules } from './abstraction_rules';
import { cloneDeep } from 'lodash';
import { ModelGraph, AbstractionIssue } from ".";


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

export class Abstractor implements Service {
  project: Project;
  options: AbstractionOptions;
  graph: ModelGraph;
  abstraction: AbstractionRules;
  name: string;
  issues: AbstractionIssue[];

  constructor(project: Project, options: Partial<AbstractionOptions>) {
    this.project = project;
    this.options = new AbstractionOptions(options);
    const diagram = project?.diagrams.find(elem => elem.id === this.options.activeDiagramId)
    this.name = diagram.getName();
    this.graph = new ModelGraph(cloneDeep(this.project.model), cloneDeep(diagram));
    this.abstraction = new AbstractionRules(this.graph);
    // debug
    this.graph.printGraph();
    // -----
  }

  run(): { result: any; issues?: ServiceIssue[] } {
    const { graph, issues } = this.buildAbstraction(this.options.activeElementId, this.options.abstractionRule);
    this.graph = graph;
    this.issues = issues;
    // debug
    this.graph.printGraph();
    // -----

    const model = this.graph.exportModel(this.name);
    const diagram = this.graph.exportDiagram(this.name, model);   
    this.project.model.contents.push(model); 
    this.project.addDiagram(diagram);
    
    return {
      result: this.project,
      issues: this.issues
    };
  }

  buildAbstraction(activeElementId: string, abstractionRule: string) {
    if (activeElementId) {
      const node = this.graph.allNodes[this.graph.idMap[activeElementId]];
      this.name = this.name + ": abstract " + node.element.getName();
      return this.abstraction.abstract(node);
    }

    console.log("Abstraction rule to be applied: " + abstractionRule);
    switch (abstractionRule) {
      case 'parthood':
        this.name = this.name + ": parthood abstraction";
        return this.abstraction.parthood(this.graph.getPartOfRelations());
      case 'hierarchy':
        this.name = this.name + ": hierarchy abstraction";
        return this.abstraction.hierarchy(
          this.graph.getRelationsByType(OntoumlType.GENERALIZATION_TYPE),
          this.graph.getRelationsByType(OntoumlType.GENERALIZATION_SET_TYPE)
        );
      case 'aspects':
        this.name = this.name + ": moments abstraction";
        return this.abstraction.aspects(
          this.graph.getElementsByStereotypes(stereotypeUtils.MomentOnlyStereotypes)
        );
    }

    console.warn("No abstraction was build");
    return { graph: this.graph, issues: this.issues };
  }
}
