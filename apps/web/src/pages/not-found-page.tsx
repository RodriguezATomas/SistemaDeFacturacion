import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/shared/common';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Página no encontrada"
      description="La dirección no existe o fue movida."
      action={<Button asChild variant="outline"><Link to="/">Ir al panel</Link></Button>}
    />
  );
}
