import { market } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import type { QuoteData } from '../../api/types';
import FuturesPanel from './FuturesPanel';
import InternationalPanel from './InternationalPanel';
import CommoditiesPanel from './CommoditiesPanel';

interface Props {
  refreshKey: number;
  live: boolean;
}

export default function GlobalMarketsRow({ refreshKey, live }: Props) {
  const futures = useApi<QuoteData[]>(
    () => market.getFutures(live),
    [refreshKey, live],
  );

  const international = useApi<QuoteData[]>(
    () => market.getInternational(),
    [refreshKey],
  );

  const commodities = useApi<QuoteData[]>(
    () => market.getCommodities(live),
    [refreshKey, live],
  );

  return (
    <div className="global-markets-row">
      <FuturesPanel
        quotes={futures.data ?? []}
        loading={futures.loading}
      />
      <InternationalPanel
        quotes={international.data ?? []}
        loading={international.loading}
      />
      <CommoditiesPanel
        quotes={commodities.data ?? []}
        loading={commodities.loading}
      />
    </div>
  );
}
