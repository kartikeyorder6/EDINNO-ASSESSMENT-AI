import { redirect } from "next/navigation";

export default function GradeRootPage() {
  redirect("/studio?tab=curriculum");
}

