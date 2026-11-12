import { useSearchParams } from 'react-router-dom';
import { Badge, PageTitle } from '../components/ui';
import { emptyForm, fromDraft } from '../sim/DraftForm';
import { GoogleWizard } from '../sim/GoogleWizard';
import { MetaWizard } from '../sim/MetaWizard';
import { useSim } from '../sim/simContext';
import { ROLE_LABEL } from '../sim/changeFlow';
import { useAppState } from '../state/AppState';

export default function CreatePage() {
  const sim = useSim();
  const { workspace } = useAppState();
  const [params] = useSearchParams();
  const draft = sim.drafts.find((d) => d.id === params.get('draft'));
  const platform = draft ? draft.platform : workspace;
  const initial = draft ? fromDraft(draft) : emptyForm(platform);
  return (
    <div className="space-y-4">
      <PageTitle
        title={platform === 'meta' ? 'Create campaign' : 'New Google campaign'}
        badge={<Badge tone="neutral">Simulated</Badge>}
        sub={`Guided ${platform === 'meta' ? '6-step Meta' : '7-step Google'} flow. Everything is created PAUSED, and activation is a separate confirmed action. Acting as ${ROLE_LABEL[sim.role]}. Drafts stay in this browser.`}
      />
      {platform === 'meta' ? <MetaWizard key={`${draft?.id ?? 'new'}-meta`} initial={initial} /> : <GoogleWizard key={`${draft?.id ?? 'new'}-google`} initial={initial} />}
    </div>
  );
}
