import { ServiceOptions } from '@libs/service_options';

export class AbstractionOptions implements ServiceOptions {
  activeDiagramId: string;
  
  constructor(base: Partial<AbstractionOptions> = {}) {
    this.activeDiagramId = null;

    Object.keys(base).forEach(key => (this[key] = base[key]));
  }
}
