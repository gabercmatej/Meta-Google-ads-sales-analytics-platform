import { useAppState } from '../state/AppState';
import MetaOverview from './MetaOverview';
import GoogleOverview from './GoogleOverview';

export default function OverviewPage() {
  const { workspace } = useAppState();
  return workspace === 'google' ? <GoogleOverview /> : <MetaOverview />;
}
