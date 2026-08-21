import { Component, type ReactNode } from 'react';

// Error boundary for surfaces whose backing query can legitimately fail for
// the viewer — e.g. `getJoinPreview` / `listRoster` answer "Campaign not
// found" for a bad code or a private campaign the viewer can't see. Convex's
// useQuery throws into render, so the page supplies the not-found rendering
// as `fallback` here rather than branching inline.
export class QueryBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
