import { ServiceOptions } from '@libs/service_options';

export class AbstractionOptions implements ServiceOptions {
  activeDiagramId: string;
  abstractionRule: string;
  
  constructor(base: Partial<AbstractionOptions> = {}) {
    this.activeDiagramId = '';
    this.abstractionRule = '';

    Object.keys(base).forEach(key => (this[key] = base[key]));

    this.abstractionRule = 'p2';
  }
}
