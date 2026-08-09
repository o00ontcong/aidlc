import type { V3ApplicationClient, V3Artifact } from '../../contracts';
import { createV3CommandFactory } from '../../contracts';

/** Opens annotation from an artifact/review context; feedback still enters the Epic command bus. */
export function ArtifactAnnotationAction({ epicId, artifact, enabled, client }: {
  epicId: string;
  artifact: V3Artifact;
  enabled: boolean;
  client: V3ApplicationClient;
}) {
  const command = createV3CommandFactory('annotation');
  if (!enabled) return null;
  return <button type="button" onClick={() => client.dispatch(command('capability.annotation.open', { epicId, artifactId: artifact.id, path: artifact.path }))} className="shrink-0 text-[10px] font-medium text-primary hover:underline">Annotate</button>;
}

export function sendAnnotationFeedback(client: V3ApplicationClient, epicId: string, artifactId: string, feedback: string): void {
  if (!feedback.trim()) return;
  const command = createV3CommandFactory('annotation-feedback');
  client.dispatch(command('epic.review.feedback', { epicId, artifactId, feedback }));
}
