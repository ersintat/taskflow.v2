import { ProjectDetailClient } from './_components/project-detail-client';

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  return <ProjectDetailClient projectId={params.id} />;
}
