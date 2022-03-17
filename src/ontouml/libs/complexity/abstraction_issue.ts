import { ServiceIssue } from '@libs/service_issue';
import { ServiceIssueSeverity } from '@libs/service_issue_severity';
import { OntoumlElement } from "@libs/ontouml";

export class AbstractionIssue implements ServiceIssue {
    id: string;
    code: string;
    title: string;
    description: string;
    severity: ServiceIssueSeverity;
    data: { source: OntoumlElement };

    constructor(
        source: OntoumlElement,
        title: string,
        severity: ServiceIssueSeverity = ServiceIssueSeverity.WARNING,
        description?: string
      ) {
        this.code = 'not_abstractable_class';
        this.title = title;
        this.severity = severity || ServiceIssueSeverity.WARNING;
        this.description = description || null;
        this.data = { source };
      }
}