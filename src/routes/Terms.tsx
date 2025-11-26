// src/routes/Terms.tsx
import {useNavigate}from "react-router-dom";
import {ArrowLeft}from "lucide-react";

export default function TermsPage(){
  const nav=useNavigate();

  function onBack(){
    nav(-1); // returns to /parent, /auth/register, or wherever they came from
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

      <h1 className="text-2xl font-bold mb-1">Terms &amp; Conditions</h1>
      <p className="text-xs text-slate-400 mb-4">Last updated: November 2025</p>

      <p className="mb-4">
        These Terms &amp; Conditions govern your use of the DailyPromise family app
        (including the parent and child experiences) (the “Service”). By creating an
        account or using the Service, you agree to these Terms. If you do not agree,
        please do not use the Service.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">1. Accounts &amp; Eligibility</h2>
      <p className="mb-2">
        The Service is designed for families. Parent or legal guardian accounts
        (“Parent Accounts”) are responsible for managing child access and profiles.
        By creating a Parent Account, you confirm that you are at least 18 years old
        (or the age of majority in your region) and are legally allowed to consent
        on behalf of your child or children.
      </p>
      <p className="mb-2">
        You agree to provide accurate information when creating an account and to
        keep your login credentials secure. You are responsible for all activity
        that occurs under your account.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">2. Use of the Service</h2>
      <p className="mb-2">
        DailyPromise helps families set goals and “promises,” track habits and daily
        activities, and reward children using points, targets, checklists, stories,
        games, and similar features.
      </p>
      <p className="mb-2">
        You agree not to use the Service for any unlawful or harmful purpose, including:
      </p>
      <ul className="list-disc ml-5 mb-2">
        <li>Bullying, harassment, or hate speech.</li>
        <li>Sharing violent, explicit, or otherwise inappropriate content with children.</li>
        <li>Attempting to compromise the security or stability of the Service.</li>
        <li>Reverse engineering or abusing our APIs or infrastructure.</li>
      </ul>
      <p className="mb-2">
        You are responsible for supervising your child’s use of the app and for deciding
        which goals, tasks, and rewards are appropriate for them.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">3. Points, Wallets, Rewards &amp; Offers</h2>
      <p className="mb-2">
        DailyPromise includes a points and rewards system (“Wallet,” “Points,”
        “Targets,” “Rewards,” “Offers,” and similar features). These features are a
        family tracking and motivation tool only. They:
      </p>
      <ul className="list-disc ml-5 mb-2">
        <li>Have no cash value.</li>
        <li>Cannot be exchanged for real-world currency or financial instruments.</li>
        <li>Are created, managed, and approved entirely by Parent Accounts.</li>
      </ul>
      <p className="mb-2">
        When you promise real-world items or experiences (for example, “movie night”
        or “extra screen time”), those are agreements between you and your child only.
        DailyPromise does not fulfill, guarantee, or enforce any rewards or offers.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">4. AI Features &amp; Generated Content</h2>
      <p className="mb-2">
        DailyPromise may use artificial intelligence (“AI”) features, such as
        suggestions for targets and tasks, wishlists, stories, prompts, educational
        games, or images. These features may be powered by our own models or by
        third-party AI providers.
      </p>
      <ul className="list-disc ml-5 mb-2">
        <li>AI suggestions and outputs may be incomplete, imprecise, or inappropriate.</li>
        <li>
          You agree to review AI-generated content before sharing it with your child
          and to modify or discard anything you feel is not suitable.
        </li>
        <li>
          We may log AI prompts, responses, and related metadata to operate, monitor,
          and improve these features in a privacy-conscious way, as described in the
          Privacy Policy.
        </li>
      </ul>
      <p className="mb-2">
        AI outputs are provided “as is” and are not guaranteed to be accurate,
        educationally complete, or suitable for any specific purpose.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">5. Content &amp; Data You Provide</h2>
      <p className="mb-2">
        You may enter information about your family, including child names or nicknames,
        ages, tasks, targets, checklists, wishlists, rewards, daily activities, and
        progress. You may also upload or capture photos, videos, audio clips, or text
        that serve as “evidence” or memories of completed activities.
      </p>
      <p className="mb-2">
        You remain responsible for the content you submit. You agree that you have the
        necessary rights to upload and share this content in the app, and that it does
        not infringe the rights of others or violate applicable law.
      </p>
      <p className="mb-2">
        We may use aggregated and anonymized information (for example, total tasks
        completed or points trends across many families) to understand how the Service
        is used and to improve it. Aggregated and anonymized data does not identify
        individual families or children.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">6. Safety, Wellbeing &amp; Limits</h2>
      <p className="mb-2">
        DailyPromise is a motivational and organizational tool, not a replacement for
        parenting, education, medical care, or mental health support. The app is not
        intended to diagnose, treat, or manage any medical or psychological condition.
      </p>
      <p className="mb-2">
        You are responsible for setting healthy, age-appropriate goals and rewards and
        for monitoring your child’s wellbeing and screen time. If you have concerns
        about your child’s health, development, or mental wellbeing, please seek help
        from qualified professionals.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">7. Service Changes &amp; Availability</h2>
      <p className="mb-2">
        We may update or change features, introduce new functionality, or temporarily
        suspend parts of the Service for maintenance, improvements, or other reasons.
        We may also modify or discontinue specific AI features, games, or experiments.
      </p>
      <p className="mb-2">
        While we aim for reliability, we do not guarantee that the Service will always
        be available, uninterrupted, or error-free. We are not liable for any loss
        resulting from downtime, data loss, or changes to the Service.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">8. Disclaimers</h2>
      <p className="mb-2">
        The Service (including all content, AI features, and tools) is provided
        “as is” and “as available,” without warranties of any kind, whether express
        or implied, including any implied warranties of merchantability, fitness for
        a particular purpose, or non-infringement.
      </p>
      <p className="mb-2">
        We do not guarantee that the Service will meet your expectations, achieve
        specific educational or behavioral outcomes, or be free from errors, bugs,
        or interruptions.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">9. Limitation of Liability</h2>
      <p className="mb-2">
        To the maximum extent permitted by law, we and our partners are not liable
        for any indirect, incidental, special, consequential, or punitive damages,
        or for any loss of data, profits, or goodwill, arising out of or related to
        your use of (or inability to use) the Service.
      </p>
      <p className="mb-2">
        In all cases, our total liability for any claim related to the Service will
        be limited to the amount you have paid to us for the Service, if any, in the
        12 months immediately before the event giving rise to the claim.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">10. Changes to These Terms</h2>
      <p className="mb-2">
        We may update these Terms from time to time. When we do, we will update the
        “Last updated” date at the top of this page. Your continued use of the Service
        after any changes are posted means you accept the updated Terms.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">11. Contact</h2>
      <p className="mb-2">
        If you have questions about these Terms, you can contact us at:
        <br/>
        <span className="font-mono">support@dailypromise.app</span> (replace with your real contact email).
      </p>

      <p className="mt-6 text-xs text-slate-400">
        This document is a general template provided for convenience and does not constitute legal advice.
        Please review and adapt it with a qualified legal professional before using it in production.
      </p>
    </div>
  );
}
