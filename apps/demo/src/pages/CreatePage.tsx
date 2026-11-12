import { Link } from 'react-router-dom';
import { Badge, PageTitle } from '../components/ui';
import { DraftForm, emptyForm } from '../sim/DraftForm';
import { useSim } from '../sim/simContext';
import { ROLE_LABEL } from '../sim/changeFlow';
import { useAppState } from '../state/AppState';

export default function CreatePage() {
  const sim = useSim();
  const { workspace } = useAppState();
  return (
    <div className="space-y-4">
      <PageTitle
        title="Create campaign"
        badge={<Badge tone="warn">Simulated</Badge>}
        sub={`Guided ${workspace === 'meta' ? '6-step Meta' : '7-step Google'} flow. Everything is created PAUSED, and activation is a separate confirmed action. Acting as ${ROLE_LABEL[sim.role]}. Drafts stay in this browser.`}
        right={
          <Link className="btn btn-secondary btn-sm" to="/drafts">
            Drafts ({sim.drafts.length})
          </Link>
        }
      />
      <DraftForm key={workspace} initial={emptyForm(workspace)} idPrefix="create" />
    </div>
  );
}
