import { Navigate, Route, Routes } from "react-router-dom";
import { AnalyticsPage } from "../../pages/Analytics";
import { AudiencePage } from "../../pages/Audience";
import { ContentPage } from "../../pages/Content";
import { ExperimentsPage } from "../../pages/Experiments";
import { GoalsPage } from "../../pages/Goals";
import { InsightsPage } from "../../pages/Insights";
import { OverviewPage } from "../../pages/Overview";
import { PlannerPage } from "../../pages/Planner";
import { PostDetailPage } from "../../pages/PostDetail";
import { SettingsPage } from "../../pages/Settings";
import { ApprovalsPage } from "../../pages/Approvals";
import { CampaignsPage } from "../../pages/Campaigns";
import { StudioPage } from "../../pages/Studio";
import { ResearchPage } from "../../pages/Research";
import { SearchPage } from "../../pages/Search";
import { TrendsPage } from "../../pages/Trends";
import { ThemesPage } from "../../pages/Themes";
import { FunnelPage } from "../../pages/Funnel";
import { StrategyPage } from "../../pages/Strategy";
import { ComparePage } from "../../pages/Compare";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<OverviewPage />} />
      <Route path="/content" element={<ContentPage />} />
      <Route path="/content/:id" element={<PostDetailPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/audience" element={<AudiencePage />} />
      <Route path="/compare" element={<ComparePage />} />
      <Route path="/insights" element={<InsightsPage />} />
      <Route path="/planner" element={<PlannerPage />} />
      <Route path="/goals" element={<GoalsPage />} />
      <Route path="/experiments" element={<ExperimentsPage />} />
      <Route path="/research" element={<ResearchPage />} />
      <Route path="/trends" element={<TrendsPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/themes" element={<ThemesPage />} />
      <Route path="/strategy" element={<StrategyPage />} />
      <Route path="/campaigns" element={<CampaignsPage />} />
      <Route path="/funnel" element={<FunnelPage />} />
      <Route path="/studio" element={<StudioPage />} />
      <Route path="/approvals" element={<ApprovalsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
