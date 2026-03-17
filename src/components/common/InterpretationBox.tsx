import type { VerdictType } from '../../utils/types';

interface Props {
  verdict: VerdictType;
  verdictLabel: string;
  paragraphs: string[];
}

// Renders [green]...[/green] style inline markup within a paragraph string.
function renderParagraph(text: string, key: number) {
  const parts = text.split(/(\[(?:green|red|yellow|blue)\].*?\[\/(?:green|red|yellow|blue)\])/);
  return (
    <p key={key} className="interp-paragraph">
      {parts.map((part, i) => {
        const match = part.match(/^\[(green|red|yellow|blue)\](.*)\[\/(?:green|red|yellow|blue)\]$/);
        if (match) {
          return <span key={i} className={`highlight-${match[1]}`}>{match[2]}</span>;
        }
        return part;
      })}
    </p>
  );
}

export default function InterpretationBox({ verdict, verdictLabel, paragraphs }: Props) {
  return (
    <div className="interpretation-box">
      <div className="interpretation-header">
        <span className="interpretation-title">Analysis & Interpretation</span>
        <span className={`verdict-badge verdict-${verdict}`}>{verdictLabel}</span>
      </div>
      <div className="interpretation-body">
        {paragraphs.map((p, i) => renderParagraph(p, i))}
      </div>
    </div>
  );
}
