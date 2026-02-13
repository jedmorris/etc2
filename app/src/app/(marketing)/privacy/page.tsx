import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Last updated: February 13, 2026
      </p>

      <div className="mt-10 space-y-10 text-base leading-7 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">
            1. Information We Collect
          </h2>
          <p className="mt-3">
            We collect information you provide directly to us when you create an
            account, subscribe to a plan, or contact us for support. This
            includes your name, email address, billing information, and any
            other information you choose to provide.
          </p>
          <p className="mt-3">
            We also automatically collect certain technical information when you
            use the Service, including your IP address, browser type, operating
            system, referring URLs, and information about how you interact with
            the Service (such as pages visited, features used, and session
            duration).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            2. How We Use Your Information
          </h2>
          <p className="mt-3">
            We use the information we collect to:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Provide, maintain, and improve the Service</li>
            <li>
              Process transactions and send related information, including
              purchase confirmations and invoices
            </li>
            <li>
              Send you technical notices, updates, security alerts, and
              administrative messages
            </li>
            <li>
              Respond to your comments, questions, and customer service requests
            </li>
            <li>
              Monitor and analyze trends, usage, and activities in connection
              with the Service
            </li>
            <li>
              Detect, investigate, and prevent fraudulent transactions and other
              unauthorized or illegal activities
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            3. Data from Connected Platforms
          </h2>
          <p className="mt-3">
            The core functionality of etC2 relies on integrating with
            third-party e-commerce and print-on-demand platforms. When you
            connect your accounts, we access and store data from the following
            platforms:
          </p>

          <h3 className="mt-6 text-lg font-medium text-foreground">
            Etsy
          </h3>
          <p className="mt-2">
            When you connect your Etsy shop, we access your shop profile, order
            history, transaction details, revenue data, product listings, and
            shipping information through the Etsy Open API. We use this data to
            provide order tracking, profit calculations, and sales analytics.
          </p>

          <h3 className="mt-6 text-lg font-medium text-foreground">
            Shopify
          </h3>
          <p className="mt-2">
            When you connect your Shopify store, we access your order data,
            product catalog, customer information (limited to order context),
            and financial summaries through the Shopify Admin API. This data is
            used to unify your multi-channel analytics and provide cross-platform
            profitability insights.
          </p>

          <h3 className="mt-6 text-lg font-medium text-foreground">
            Printify
          </h3>
          <p className="mt-2">
            When you connect your Printify account, we access your product
            blueprints, production costs, order fulfillment status, and shipping
            costs through the Printify API. This data is essential for
            calculating your true cost of goods sold and accurate profit margins.
          </p>

          <p className="mt-6">
            All API tokens and credentials for connected platforms are encrypted
            at rest using industry-standard AES-256 encryption. We only access
            the minimum data necessary to provide the Service and never modify
            your data on connected platforms without your explicit instruction.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            4. Data Security
          </h2>
          <p className="mt-3">
            We take reasonable measures to help protect your personal
            information from loss, theft, misuse, unauthorized access,
            disclosure, alteration, and destruction. These measures include:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Encryption of data in transit using TLS 1.2 or higher</li>
            <li>
              Encryption of API tokens and sensitive credentials at rest using
              AES-256 encryption
            </li>
            <li>
              Regular security assessments and monitoring of our infrastructure
            </li>
            <li>
              Access controls that limit employee access to personal data on a
              need-to-know basis
            </li>
            <li>
              Secure cloud infrastructure with industry-standard physical and
              network security
            </li>
          </ul>
          <p className="mt-3">
            While we strive to protect your information, no method of
            transmission over the Internet or method of electronic storage is
            completely secure. We cannot guarantee the absolute security of your
            data.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            5. Data Retention
          </h2>
          <p className="mt-3">
            We retain your personal information and connected platform data for
            as long as your account is active or as needed to provide you the
            Service. If you close your account, we will retain your data for a
            period of thirty (30) days to allow for account recovery or data
            export. After this period, we will delete or anonymize your data
            within ninety (90) days, unless we are required to retain it for
            legal, regulatory, or legitimate business purposes.
          </p>
          <p className="mt-3">
            Aggregated and anonymized data that cannot be used to identify you
            may be retained indefinitely for analytics and service improvement
            purposes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            6. Your Rights
          </h2>
          <p className="mt-3">
            Depending on your location, you may have certain rights regarding
            your personal information, including:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong className="text-foreground">Access:</strong> The right to
              request a copy of the personal information we hold about you
            </li>
            <li>
              <strong className="text-foreground">Correction:</strong> The right
              to request correction of inaccurate personal information
            </li>
            <li>
              <strong className="text-foreground">Deletion:</strong> The right
              to request deletion of your personal information, subject to
              certain exceptions
            </li>
            <li>
              <strong className="text-foreground">Portability:</strong> The
              right to request an export of your data in a machine-readable
              format
            </li>
            <li>
              <strong className="text-foreground">Opt-out:</strong> The right to
              opt out of certain data processing activities, including marketing
              communications
            </li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, please contact us at{" "}
            <a
              href="mailto:support@etc2.com"
              className="text-foreground underline underline-offset-4 hover:text-foreground/80"
            >
              support@etc2.com
            </a>
            . We will respond to your request within thirty (30) days.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            7. Third-Party Services
          </h2>
          <p className="mt-3">
            The Service may contain links to or integrate with third-party
            websites and services that are not owned or controlled by etC2. We
            are not responsible for the privacy practices of these third
            parties. We encourage you to review the privacy policies of any
            third-party services you access through or in connection with the
            Service.
          </p>
          <p className="mt-3">
            We may use third-party service providers to help us operate the
            Service, including but not limited to hosting providers, payment
            processors, analytics providers, and customer support tools. These
            providers have access to your personal information only to perform
            tasks on our behalf and are obligated to not disclose or use it for
            other purposes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            8. Children&apos;s Privacy
          </h2>
          <p className="mt-3">
            The Service is not directed to individuals under the age of 18. We
            do not knowingly collect personal information from children under
            18. If we become aware that a child under 18 has provided us with
            personal information, we will take steps to delete such information.
            If you believe that a child under 18 has provided us with personal
            information, please contact us at{" "}
            <a
              href="mailto:support@etc2.com"
              className="text-foreground underline underline-offset-4 hover:text-foreground/80"
            >
              support@etc2.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            9. Changes to This Policy
          </h2>
          <p className="mt-3">
            We may update this Privacy Policy from time to time. If we make
            material changes, we will notify you by posting the updated policy
            on the Service and updating the &quot;Last updated&quot; date. We
            may also provide additional notice, such as an email notification,
            for significant changes. Your continued use of the Service after the
            effective date of the revised policy constitutes your acceptance of
            the changes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            10. Contact
          </h2>
          <p className="mt-3">
            If you have any questions about this Privacy Policy or our data
            practices, please contact us at{" "}
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
