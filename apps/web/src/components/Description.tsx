import type { DescriptionBlock } from '@pickledeals/shared';

type Run = { text: string; bold?: boolean };

const runs = (rs: Run[]) => rs.map((r, i) => (r.bold ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>));

/** The store's own product description (synced from a connected Shopify store), as plain text blocks. */
export function Description({ blocks }: { blocks: DescriptionBlock[] }) {
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        const block = b as { kind: 'heading'; text: string } | { kind: 'paragraph'; runs: Run[] } | { kind: 'list'; items: Run[][] };
        if (block.kind === 'heading') return <h3 key={i} style={{ fontSize: 17, marginTop: 14 }}>{block.text}</h3>;
        if (block.kind === 'list')
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{runs(item)}</li>
              ))}
            </ul>
          );
        return <p key={i}>{runs(block.runs)}</p>;
      })}
    </div>
  );
}
