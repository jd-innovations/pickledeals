import { notFound } from 'next/navigation';

import { DealDetail, loadDeal } from '@/components/DealDetail';
import { CloseModalButton, ModalFrame } from '@/components/client/Chrome';

/**
 * Deal pop-up (approved): opening a deal from a list shows it over the list with the deal's own
 * address, so it can be shared, and closing it returns to the same spot.
 */
export default async function DealModal({ params }: { params: Promise<{ id: string }> }) {
  const data = await loadDeal((await params).id);
  if (!data) notFound();
  const p = data.product;
  return (
    <ModalFrame label={`${p.brand.name} ${p.name} deal`}>
      <div className="dialog-bar">
        <nav className="crumbs" aria-label="Breadcrumb">
          <span>{p.category.name}</span>
          <span aria-hidden="true">›</span>
          <span aria-current="page">
            {p.brand.name} {p.name}
          </span>
        </nav>
        <CloseModalButton />
      </div>
      <div className="dialog-body">
        <DealDetail data={data} headingLevel="h2" />
      </div>
    </ModalFrame>
  );
}
