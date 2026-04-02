import { useState } from 'react';
import type { AssetProfile as AssetProfileType } from '../../api/types';

interface Props {
  profile: AssetProfileType;
}

function fmtEmployees(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

// Strip protocol and trailing slash for display
function fmtWebsite(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export default function AssetProfile({ profile }: Props) {
  const [expanded, setExpanded] = useState(false);

  const hasDescription = !!profile.description;
  // Truncate at ~400 chars for the collapsed view
  const shouldTruncate = profile.description.length > 400;
  const displayText = !expanded && shouldTruncate
    ? profile.description.slice(0, 400).trimEnd() + '…'
    : profile.description;

  const tags: { label: string; icon: string }[] = [];
  if (profile.sector)       tags.push({ icon: '⬡', label: profile.sector });
  if (profile.industry)     tags.push({ icon: '⬡', label: profile.industry });
  if (profile.legalType)    tags.push({ icon: '⬡', label: profile.legalType });
  if (profile.fundFamily)   tags.push({ icon: '⬡', label: profile.fundFamily });
  if (profile.fundCategory) tags.push({ icon: '⬡', label: profile.fundCategory });
  if (profile.country)      tags.push({ icon: '⬡', label: profile.country });
  if (profile.employees)    tags.push({ icon: '⬡', label: `${fmtEmployees(profile.employees)} employees` });

  if (!hasDescription && tags.length === 0) return null;

  return (
    <div className="asset-profile-card">
      <div className="asset-profile-heading">About {profile.symbol}</div>

      {hasDescription && (
        <div className="asset-profile-desc-wrap">
          <p className="asset-profile-desc">{displayText}</p>
          {shouldTruncate && (
            <button
              className="asset-profile-toggle"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className="asset-profile-tags">
          {tags.map(t => (
            <span key={t.label} className="asset-profile-tag">{t.label}</span>
          ))}
          {profile.website && (
            <a
              className="asset-profile-tag asset-profile-tag--link"
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              ↗ {fmtWebsite(profile.website)}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
