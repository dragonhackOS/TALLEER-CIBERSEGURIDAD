import { env } from "@/lib/env";
import { MyRegistrations } from "@/features/enrollment/my-registrations";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi inscripción" };

export default function MyRegistrationPage() {
  return (
    <div className="container max-w-3xl py-8 sm:py-14">
      <MyRegistrations domain={env().ALLOWED_EMAIL_DOMAIN} />
    </div>
  );
}
