import { Project, stereotypeUtils } from '@libs/ontouml'; 
import { Service } from '@libs/service';
import { ServiceIssue } from '@libs/service_issue';
import { AbstractionOptions } from './options';
import { AbstractionRules } from './abstraction_rules';
import { cloneDeep } from 'lodash'
import { ModelGraph } from ".";


/**
 * Class that implements abstraction algorithm proposed in:
 *
 * Romanenko, E., Calvanese, D. and Guizzardi, G. (2022)
 * Ontology-Based Model Abstraction Reviewed.
 *
 * @author Elena Romanenko
 */

export class Abstractor implements Service {
  project: Project;
  options: AbstractionOptions;
  graph: ModelGraph;
  abstraction: AbstractionRules;
  name: string;

  constructor(project: Project, options: Partial<AbstractionOptions>) {
    this.project = project;
    this.options = new AbstractionOptions(options);
    const diagram = project?.diagrams.find(elem => elem.id === this.options.activeDiagramId)
    this.name = diagram.getName();
    this.graph = new ModelGraph(cloneDeep(this.project.model), cloneDeep(diagram));
    this.abstraction = new AbstractionRules(this.graph);
  }

  run(): { result: any; issues?: ServiceIssue[] } {
    this.graph = this.buildAbstraction(this.options.activeElementId, this.options.abstractionRule);
    const model = this.graph.exportModel(this.name);
    const diagram = this.graph.exportDiagram(this.name, model);
    this.project.model.contents.push(model);    
    this.project.addDiagram(diagram);

    return {
      result: this.project,
      issues: null,
    };
  }

  buildAbstraction(activeElementId: string, abstractionRule: string): ModelGraph {
    if (activeElementId) {
      const node = this.graph.allNodes[this.graph.idMap[activeElementId]];
      this.name = this.name + ": abstract " + node.element.getName();
      return this.abstraction.abstract(node);
    }

    console.log("Abstraction rule to be applied: " + abstractionRule);
    switch (abstractionRule) {
      case 'parthood':
        this.name = this.name + ": abstraction parthood";
        return this.abstraction.parthood(
          this.graph.getElementsByStereotypes(stereotypeUtils.PartWholeRelationStereotypes)
        );
    }

    console.warn("No abstraction was build");
    return null;
  }
}
