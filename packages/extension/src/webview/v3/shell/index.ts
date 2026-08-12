// The v3 panel renders inside a real VS Code editor tab, so it has no chrome
// of its own: the window title bar, editor tab strip, Activity Bar, and
// project sidebar are all VS Code's (the Activity Bar sidebar lives in
// webview/components/AppSidebar.tsx). Only the panel's own view tabs and
// status strip belong here.
export * from './ViewTabs';
export * from './StatusBar';
