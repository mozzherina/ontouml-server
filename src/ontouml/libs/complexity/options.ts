import { ServiceOptions } from '@libs/service_options';

export class AbstractionOptions implements ServiceOptions {
  activeDiagramId: string;
  activeElementId: string;
  abstractionRule: string;
  
  constructor(base: Partial<AbstractionOptions> = {}) {
    this.activeDiagramId = '';

    Object.keys(base).forEach(key => (this[key] = base[key]));
  }
}
