import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasFeature, type PlanId } from "@/lib/stripe/plans";

interface FeatureGateProps {
  feature: string;
  plan: PlanId;
  featureLabel: string;
  requiredPlan?: string;
  children: React.ReactNode;
}

export function FeatureGate({
  feature,
  plan,
  featureLabel,
  requiredPlan = "Growth",
  children,
}: FeatureGateProps) {
  if (hasFeature(plan, feature)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Lock className="size-6 text-muted-foreground" />
          </div>
          <CardTitle className="mt-4">{featureLabel}</CardTitle>
          <CardDescription>
            {featureLabel} requires the {requiredPlan} plan or above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/app/settings/billing">
            <Button>Upgrade to {requiredPlan}</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
