import { Link } from 'react-router-dom';
import { PageHeader, Badge, Card } from '../components/ui';
import { DraftForm, emptyForm } from '../sim/DraftForm';
import { useSim } from '../sim/simContext';
import { ROLE_LABEL } from '../sim/changeFlow';
import './sim-pages.css';

export default function CreatePage() {
  const sim = useSim();
  return (
    <div className="create-page">
      <PageHeader
        title="Create campaign"
        description="A guided flow for a new campaign and a first ad. Everything is created PAUSED, and activation is a separate confirmed action."
        badge={<Badge tone="warn">Simulated</Badge>}
        actions={
          <Link className="btn btn-secondary" to="/drafts">
            Drafts ({sim.drafts.length})
          </Link>
        }
      />
      <Card subtitle={`Acting as ${ROLE_LABEL[sim.role]}. Drafts stay in this browser.`}>
        <DraftForm initial={emptyForm()} idPrefix="create" />
      </Card>
    </div>
  );
}
