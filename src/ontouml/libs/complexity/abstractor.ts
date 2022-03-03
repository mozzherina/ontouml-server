import { Project, RelationStereotype } from '@libs/ontouml'; 
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
    this.graph = this.buildAbstraction(this.options.abstractionRule);
    const model = this.graph.exportModel(this.name);
    const diagram = this.graph.exportDiagram(this.name, model);
    this.project.model.contents.push(model);    
    this.project.addDiagram(diagram);

    return {
      result: this.project,
      issues: null,
    };
  }

  buildAbstraction(abstractionRule: string): ModelGraph {
    console.log("Abstraction rule to be applied: " + abstractionRule);
    switch (abstractionRule) {
      case 'p2':
        this.name = "Abstraction P2: " + this.name;
        return this.abstraction.p2(this.graph.allStereotypes[RelationStereotype.COMPONENT_OF]);
    }
    console.warn("No abstraction was build");
    return null;
  }
}
