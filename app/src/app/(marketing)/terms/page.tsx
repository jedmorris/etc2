import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Last updated: February 13, 2026
      </p>

      <div className="mt-10 space-y-10 text-base leading-7 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">
            1. Acceptance of Terms
          </h2>
          <p className="mt-3">
            By accessing or using the etC2 platform (&quot;Service&quot;),
            operated by etC2 (&quot;Company,&quot; &quot;we,&quot;
            &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these
            Terms of Service (&quot;Terms&quot;). If you do not agree to these
            Terms, you may not access or use the Service. These Terms constitute
            a legally binding agreement between you and the Company.
          </p>
          <p className="mt-3">
            We reserve the right to update or modify these Terms at any time. We
            will notify you of material changes by posting the updated Terms on
            the Service and updating the &quot;Last updated&quot; date. Your
            continued use of the Service after such changes constitutes your
            acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            2. Description of Service
          </h2>
          <p className="mt-3">
            etC2 is a software-as-a-service (SaaS) analytics platform designed
            for print-on-demand sellers. The Service integrates with third-party
            platforms including Etsy, Shopify, and Printify to aggregate order
            data, calculate profitability, and provide business intelligence
            dashboards.
          </p>
          <p className="mt-3">
            The Service may include, but is not limited to: order tracking,
            profit and loss calculations, customer analytics, product
            performance reporting, and data export functionality. We may modify,
            suspend, or discontinue any aspect of the Service at any time
            without prior notice.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            3. User Accounts
          </h2>
          <p className="mt-3">
            To use the Service, you must create an account by providing accurate
            and complete registration information. You are responsible for
            maintaining the confidentiality of your account credentials and for
            all activities that occur under your account.
          </p>
          <p className="mt-3">
            You agree to: (a) provide truthful, accurate, and complete
            information during registration; (b) maintain and promptly update
            your account information; (c) notify us immediately of any
            unauthorized access to or use of your account; and (d) not share
            your account credentials with any third party.
          </p>
          <p className="mt-3">
            You must be at least 18 years of age or the age of legal majority in
            your jurisdiction to create an account and use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            4. Payment Terms
          </h2>
          <p className="mt-3">
            Certain features of the Service require a paid subscription. By
            subscribing to a paid plan, you agree to pay the applicable fees as
            described on our pricing page. All fees are quoted in U.S. dollars
            unless otherwise stated.
          </p>
          <p className="mt-3">
            Subscriptions automatically renew at the end of each billing cycle
            unless you cancel before the renewal date. You may cancel your
            subscription at any time through your account settings. Cancellation
            takes effect at the end of the current billing period, and you will
            retain access to paid features until that date.
          </p>
          <p className="mt-3">
            We reserve the right to change our pricing at any time. Price
            changes will take effect at the start of your next billing cycle,
            and we will provide you with reasonable prior notice of any price
            increases.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            5. Acceptable Use
          </h2>
          <p className="mt-3">You agree not to use the Service to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              Violate any applicable law, regulation, or third-party rights
            </li>
            <li>
              Interfere with or disrupt the integrity or performance of the
              Service
            </li>
            <li>
              Attempt to gain unauthorized access to the Service or its related
              systems or networks
            </li>
            <li>
              Use automated means (bots, scrapers, or similar) to access the
              Service beyond the scope of the provided API
            </li>
            <li>
              Reverse engineer, decompile, or disassemble any aspect of the
              Service
            </li>
            <li>
              Resell, sublicense, or redistribute the Service or any data
              obtained through it without our express written consent
            </li>
            <li>
              Upload or transmit any malicious code, viruses, or harmful data
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            6. Intellectual Property
          </h2>
          <p className="mt-3">
            The Service, including all content, features, functionality, and the
            underlying technology, is owned by etC2 and is protected by
            copyright, trademark, and other intellectual property laws. These
            Terms do not grant you any right, title, or interest in the Service
            except for the limited right to use it in accordance with these
            Terms.
          </p>
          <p className="mt-3">
            You retain ownership of all data you upload to or generate through
            the Service. By using the Service, you grant us a limited,
            non-exclusive license to use your data solely to provide and improve
            the Service. We will not sell your data to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            7. Limitation of Liability
          </h2>
          <p className="mt-3">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT
            SHALL ETC2, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR
            AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO
            LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING OUT OF OR RELATED
            TO YOUR USE OF OR INABILITY TO USE THE SERVICE.
          </p>
          <p className="mt-3">
            OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF
            OR RELATING TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE
            AMOUNT YOU HAVE PAID US IN THE TWELVE (12) MONTHS PRECEDING THE
            EVENT GIVING RISE TO THE LIABILITY, OR ONE HUNDRED U.S. DOLLARS
            ($100), WHICHEVER IS GREATER.
          </p>
          <p className="mt-3">
            THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS
            AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND, WHETHER
            EXPRESS, IMPLIED, OR STATUTORY. WE DISCLAIM ALL WARRANTIES,
            INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY,
            FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            8. Termination
          </h2>
          <p className="mt-3">
            We may suspend or terminate your access to the Service at any time,
            with or without cause, and with or without notice. Upon
            termination, your right to use the Service will immediately cease.
            You may terminate your account at any time by contacting us or
            through your account settings.
          </p>
          <p className="mt-3">
            Upon termination, we will make your data available for export for a
            period of thirty (30) days. After this period, we may delete your
            data in accordance with our data retention policies. Sections of
            these Terms that by their nature should survive termination will
            continue to apply, including but not limited to intellectual
            property, limitation of liability, and dispute resolution
            provisions.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            9. Changes to Terms
          </h2>
          <p className="mt-3">
            We reserve the right to modify these Terms at any time. If we make
            material changes, we will provide notice through the Service or by
            other means, such as email. Your continued use of the Service after
            the effective date of the revised Terms constitutes your acceptance
            of those changes. If you do not agree to the revised Terms, you must
            stop using the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            10. Contact
          </h2>
          <p className="mt-3">
            If you have any questions about these Terms of Service, please
            contact us at{" "}
            <a
              href="mailto:support@etc2.com"
              className="text-foreground underline underline-offset-4 hover:text-foreground/80"
            >
              support@etc2.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
