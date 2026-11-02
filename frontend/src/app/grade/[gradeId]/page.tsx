import { redirect } from "next/navigation";

interface GradePageProps {
  params: Promise<{ gradeId: string }>;
}

export default async function GradeDynamicPage({ params }: GradePageProps) {
  const { gradeId } = await params;
  const match = gradeId.match(/\d+/);
  const gradeNum = match ? match[0] : "6";
  redirect(`/studio?grade=${gradeNum}&tab=curriculum`);
}

