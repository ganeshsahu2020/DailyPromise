// src/routes/Privacy.tsx
import {useNavigate}from "react-router-dom";
import {ArrowLeft}from "lucide-react";

export default function PrivacyPage(){
  const nav=useNavigate();

  function onBack(){
    nav(-1); // returns to /parent, /auth/register, or previous page
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto text-sm leading-relaxed">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs text-slate-200 hover:text-white mb-4 rounded-full px-3 py-1 bg-slate-800/70 border border-white/10"
      >
        <ArrowLeft className="w-3 h-3" />
        <span>Back</span>
      </button>

      <h1 className="text-2xl font-bold mb-1">Privacy Policy</h1>
      <p className="text-xs text-slate-400 mb-4">Last updated: November 2025</p>

      <p className="mb-4">
        This Privacy Policy explains how we collect, use, and protect information when you
        use the DailyPromise family app (the “Service”). We take the privacy of families
        and children seriously and aim to collect only what we need to deliver and improve
        the experience.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">1. Information We Collect</h2>
      <ul className="list-disc ml-5 mb-2">
        <li className="mb-1">
          <span className="font-semibold">Account information:</span> Parent name, email address,
          password (stored securely via our authentication provider), and basic account settings.
        </li>
        <li className="mb-1">
          <span className="font-semibold">Family &amp; child profiles:</span> Child names or nicknames,
          age or age range, profile avatars, and other details you choose to provide to personalize
          the experience.
        </li>
        <li className="mb-1">
          <span className="font-semibold">Activity &amp; progress data:</span> Targets, promises,
          checklists, daily activities, earned points, wallet balances, rewards, redemption history,
          approvals, and related logs that help you and your child see their progress over time.
        </li>
        <li className="mb-1">
          <span className="font-semibold">Media &amp; evidence:</span> Photos, videos, audio clips,
          drawings, or text evidence that you or your child upload to record completed tasks or
          special moments.
        </li>
        <li className="mb-1">
          <span className="font-semibold">AI interactions:</span> When you use AI-powered features
          (for example, “Inspire me,” AI wishlists, story generation, or game content), we may
          collect the text or options you provide, the AI responses, and related metadata (such
          as timestamps, feature used, and language).
        </li>
        <li className="mb-1">
          <span className="font-semibold">Device &amp; usage data:</span> Basic technical information
          such as browser type, device type, approximate region, and usage patterns (e.g., which
          screens are opened and for how long). We use this to improve performance, reliability,
          and user experience.
        </li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">2. How We Use Information</h2>
      <ul className="list-disc ml-5 mb-2">
        <li className="mb-1">To create and manage parent and child accounts.</li>
        <li className="mb-1">
          To display goals, tasks, points, rewards, reports, and history to you and your family.
        </li>
        <li className="mb-1">
          To provide AI-powered suggestions, stories, and other content designed to support your
          family’s goals and routines.
        </li>
        <li className="mb-1">
          To send service-related messages (for example, password resets, critical updates, or
          important changes to the Service).
        </li>
        <li className="mb-1">
          To monitor performance, detect misuse or abuse, and keep the Service safe and reliable.
        </li>
        <li className="mb-1">
          To analyze aggregated and anonymized usage data so we can understand how families use
          DailyPromise and which features are most helpful.
        </li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">3. Data Storage &amp; Security</h2>
      <p className="mb-2">
        We store data using reputable cloud providers, including database, authentication, and
        file storage services (such as Supabase and similar infrastructure). These services help
        us manage user accounts, store profile data, and securely keep your photos, videos, and
        activity history.
      </p>
      <p className="mb-2">
        We use a combination of technical and organizational measures to protect your data,
        including authentication, access controls, and encryption where appropriate. No system
        can be fully secure, but we work to keep your information reasonably safe and to limit
        access to those who need it to operate the Service.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">4. Children’s Privacy</h2>
      <p className="mb-2">
        DailyPromise is designed for use by families, with a parent or legal guardian in control.
        Child profiles are created and managed through a Parent Account. We do not knowingly
        allow children to create accounts without a parent or guardian.
      </p>
      <p className="mb-2">
        Parents decide what information to enter about their child and what content to upload.
        Parents can review and manage their child’s information from the parent view and may
        contact us to request additional actions, such as deletion, subject to any legal
        obligations we may have.
      </p>
      <p className="mb-2">
        We do not sell children’s personal information or use it to target third-party advertising.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">5. AI Providers &amp; Third Parties</h2>
      <p className="mb-2">
        Some features of DailyPromise rely on third-party AI and infrastructure providers. When you
        use AI-powered features, we may send limited text or structured data (for example, a
        description of your child’s interests, a draft target, or wishlist context) to these
        providers so they can generate suggestions or content for you.
      </p>
      <p className="mb-2">
        We aim to minimize the personal information shared with AI providers and to avoid including
        full names or unnecessary identifiers in prompts. However, because you control what you
        enter, please avoid including more personal or sensitive details than needed when using
        AI features.
      </p>
      <p className="mb-2">
        Our third-party providers are required to handle data under their own terms and privacy
        policies. Where possible, we choose providers that are designed for privacy-conscious
        application use, not for advertising.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">6. Sharing of Information</h2>
      <p className="mb-2">
        We do not sell your personal information. We may share data with trusted third parties
        who help us operate the Service, such as:
      </p>
      <ul className="list-disc ml-5 mb-2">
        <li>Cloud hosting, database, and storage providers.</li>
        <li>Authentication and security providers.</li>
        <li>Analytics and monitoring tools.</li>
        <li>AI and machine learning service providers.</li>
      </ul>
      <p className="mb-2">
        These providers can only use the data to perform services on our behalf and are expected
        to protect it appropriately. We may also share information if required by law, to respond
        to valid legal requests, or to protect the rights, safety, or property of our users or
        the public.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">7. Data Retention</h2>
      <p className="mb-2">
        We keep your data for as long as your account is active or as needed to provide the
        Service. If you close your account, we may retain certain records for a limited period
        where required for legal, security, or operational reasons (for example, to prevent
        abuse or to comply with legal obligations).
      </p>
      <p className="mb-2">
        We may also retain aggregated or anonymized data (which does not identify you or your
        child) to help us understand long-term usage patterns and improve the Service.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">8. Your Choices &amp; Rights</h2>
      <ul className="list-disc ml-5 mb-2">
        <li className="mb-1">
          You can review and update certain account and profile information directly in the app.
        </li>
        <li className="mb-1">
          You can request that we delete your account and associated personal data, subject to
          any legal requirements to retain certain information for a period of time.
        </li>
        <li className="mb-1">
          You can choose which notifications you receive (where supported by the app settings).
        </li>
      </ul>
      <p className="mb-2">
        If you are in a region that grants specific data protection rights (for example, the
        EU/EEA or UK), you may have additional rights such as access, correction, deletion,
        restriction, or portability. You can contact us to exercise these rights, and we will
        respond in accordance with applicable law.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">9. Changes to This Policy</h2>
      <p className="mb-2">
        We may update this Privacy Policy from time to time. When we do, we will update the
        “Last updated” date at the top of this page. Your continued use of the Service after
        changes means you accept the updated Policy.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">10. Contact</h2>
      <p className="mb-2">
        If you have questions about this Privacy Policy or how we handle your data, contact us at:
        <br/>
        <span className="font-mono">privacy@dailypromise.app</span> (replace with your real contact email).
      </p>

      <p className="mt-6 text-xs text-slate-400">
        This document is a general template provided for convenience and does not constitute legal advice.
        Please review and adapt it with a qualified legal professional before using it in production.
      </p>
    </div>
  );
}
