import type { FilingsData } from '../../api/types';

interface Props {
  data: FilingsData;
  irWebsite?: string;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export default function FilingsCard({ data, irWebsite }: Props) {
  const { mostRecent10K, edgarUrl, companyName } = data;

  return (
    <div className="filings-card">
      <div className="filings-heading">SEC Filings &amp; Investor Relations</div>

      <div className="filings-grid">

        {/* 10-K Section */}
        <div className="filings-section">
          <div className="filings-section-label">Most Recent Annual Report (10-K)</div>
          {mostRecent10K ? (
            <>
              <div className="filings-meta-row">
                <div className="filings-meta-item">
                  <span className="filings-meta-key">Period Ending</span>
                  <span className="filings-meta-val">{fmtDate(mostRecent10K.reportDate)}</span>
                </div>
                <div className="filings-meta-item">
                  <span className="filings-meta-key">Filed</span>
                  <span className="filings-meta-val">{fmtDate(mostRecent10K.filingDate)}</span>
                </div>
              </div>
              <a
                className="filings-link-btn filings-link-btn--primary"
                href={mostRecent10K.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                View 10-K Filing ↗
              </a>
            </>
          ) : (
            <p className="filings-unavailable">10-K not found for this symbol.</p>
          )}
          {edgarUrl && (
            <a
              className="filings-link-btn filings-link-btn--secondary"
              href={edgarUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              All SEC Filings ↗
            </a>
          )}
        </div>

        {/* Investor Relations Section */}
        <div className="filings-section">
          <div className="filings-section-label">Investor Relations</div>
          {irWebsite ? (
            <>
              <p className="filings-ir-desc">
                Official investor relations page for{companyName ? ` ${companyName}` : ' this company'}.
                Earnings calls, press releases, SEC filings, and shareholder information.
              </p>
              <a
                className="filings-link-btn filings-link-btn--primary"
                href={irWebsite}
                target="_blank"
                rel="noopener noreferrer"
              >
                {fmtDisplayUrl(irWebsite)} ↗
              </a>
            </>
          ) : (
            <p className="filings-unavailable">
              No investor relations page on record. Try searching for "{data.symbol} investor relations".
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
