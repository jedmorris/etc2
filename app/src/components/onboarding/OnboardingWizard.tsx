"use client"

import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

const STEPS = [
  { number: 1, label: "Connect Etsy" },
  { number: 2, label: "Connect Printify" },
  { number: 3, label: "Connect Shopify" },
  { number: 4, label: "Choose Plan" },
] as const

interface OnboardingWizardProps {
  currentStep: number
  onStepComplete: (step: number) => void
  children: React.ReactNode
}

export function OnboardingWizard({
  currentStep,
  onStepComplete,
  children,
}: OnboardingWizardProps) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      {/* Step indicator */}
      <nav className="mb-10">
        <ol className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const isComplete = currentStep > step.number
            const isCurrent = currentStep === step.number
            const isUpcoming = currentStep < step.number

            return (
              <li key={step.number} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors",
                      isComplete &&
                        "border-primary bg-primary text-primary-foreground",
                      isCurrent &&
                        "border-primary text-primary",
                      isUpcoming &&
                        "border-muted-foreground/30 text-muted-foreground/50"
                    )}
                  >
                    {isComplete ? (
                      <Check className="size-4" />
                    ) : (
                      step.number
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium text-center hidden sm:block",
                      isCurrent && "text-foreground",
                      isComplete && "text-primary",
                      isUpcoming && "text-muted-foreground/50"
                    )}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Connector line */}
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-3 mt-[-1.5rem] sm:mt-[-0.25rem]",
                      currentStep > step.number + 1
                        ? "bg-primary"
                        : currentStep > step.number
                          ? "bg-primary/50"
                          : "bg-muted-foreground/20"
                    )}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      {/* Step content */}
      <div>{children}</div>
    </div>
  )
}
