/**
 * The client's Photo Submission Policy and Image License Agreement, verbatim from the Google Doc
 * shared 2026-11-24. Edit only when the client sends a new version, and update `effective` with it.
 * A string block is a paragraph; an array block is a bulleted list.
 */
export type PolicyBlock = string | string[];
export type PolicySection = { title: string; blocks: PolicyBlock[] };

export const photoSubmissionPolicy: { title: string; effective: string; sections: PolicySection[] } = {
  title: "Photo Submission Policy and Image License Agreement",
  effective: "December 1, 2026",
  sections: [
    {
      "title": "1. Welcome to the Airplane Games Photography Community",
      "blocks": [
        "Airplane Games: The Aviation Arcade celebrates aviation and the talented photographers who capture the incredible world of flight.",
        "We welcome aviation enthusiasts and photographers from around the world to submit their original photographs for potential inclusion in our games, websites, featured photography collections, social media channels and promotional materials.",
        "We respect the creativity, talent and intellectual property of our contributing photographers. Our goal is to showcase your work, celebrate aviation photography and share your images with a global community of aviation enthusiasts.",
        "By submitting a photograph and affirmatively accepting this Photo Submission Policy and Image License Agreement (“Agreement”), you agree to the following terms."
      ]
    },
    {
      "title": "2. About This Agreement",
      "blocks": [
        "This Agreement is between you, the individual submitting the photograph (“Photographer,” “you” or “your”), and Airplane Games, operating Airplane Games (“Airplane Games,” “we,” “us” or “our”).",
        "This Agreement applies to all photographs, images, captions, descriptions and accompanying materials that you submit through our websites, mobile applications, designated submission forms or other authorized submission channels."
      ]
    },
    {
      "title": "3. Copyright and Ownership",
      "blocks": [
        "You retain ownership of and copyright in the original photographs you submit to Airplane Games.",
        "Submitting a photograph does not constitute a sale, assignment or transfer of copyright or ownership to Airplane Games.",
        "The license granted under this Agreement is non-exclusive. You remain free to display, publish, distribute, sell, license or otherwise use your photographs independently, provided that any subsequent agreements do not interfere with the rights previously granted to Airplane Games.",
        "Airplane Games does not claim ownership of your original photographs."
      ]
    },
    {
      "title": "4. Grant of License",
      "blocks": [
        "In consideration of the mutual promises contained in this Agreement and the opportunity to have your photography considered for inclusion in Airplane Games, you grant Airplane Games a worldwide, non-exclusive, royalty-free, fully paid-up, perpetual license, subject to applicable law, to use your submitted photographs and accompanying materials for the purposes described in this Agreement.",
        "This license includes the right to reproduce, publish, publicly display, distribute, transmit, digitally store, incorporate, adapt and otherwise use submitted photographs in connection with:",
        [
          "Airplane Games mobile applications, video games and interactive entertainment products.",
          "Current and future Airplane Games titles, features, updates and expansions.",
          "Aviation identification games, quizzes, challenges and educational features.",
          "Plane of the Day, featured photographer collections and photography archives.",
          "Airplane Games websites and associated digital platforms.",
          "Official Airplane Games social media accounts and channels.",
          "Paid and unpaid advertising campaigns.",
          "Promotional videos, trailers, presentations and multimedia productions.",
          "Apple App Store, Google Play and other application distribution platforms.",
          "Email newsletters and promotional communications.",
          "Digital and printed marketing materials.",
          "Public relations, media outreach and promotional events.",
          "Other media formats and distribution technologies developed in the future, provided the use remains within the purposes described in this Agreement."
        ],
        "Airplane Games may use submitted photographs in both commercial and non-commercial contexts, including within products that generate revenue through advertising, subscriptions, purchases, sponsorships or other monetization methods.",
        "This license applies worldwide and is not limited to any particular country, language, device or distribution platform.",
        "Except as required by applicable law or otherwise agreed to in writing, the license does not expire and may not be unilaterally revoked."
      ]
    },
    {
      "title": "5. Limited Sublicensing and Third-Party Distribution",
      "blocks": [
        "Airplane Games may authorize its employees, contractors, developers, hosting providers, marketing agencies, application distributors, social media platforms and other authorized service providers to reproduce, process, distribute or display submitted photographs as reasonably necessary to exercise the rights granted under this Agreement.",
        "Any such authorization shall be limited to supporting Airplane Games products, operations, distribution, marketing and promotional activities.",
        "Airplane Games may transfer this Agreement and the associated license to a successor in connection with a merger, acquisition, corporate restructuring or sale of the applicable business, subject to the limitations of this Agreement and applicable law.",
        "Airplane Games will not independently sell your submitted photographs as stock photography, license them for unrelated third-party commercial campaigns or sell standalone photographic prints or merchandise without obtaining additional permission from you."
      ]
    },
    {
      "title": "6. Compensation and Royalties",
      "blocks": [
        "All photography submissions are voluntary.",
        "You acknowledge and agree that no fees, royalties, licensing payments, residuals, revenue sharing or other monetary compensation will be paid for the submission, selection, publication, distribution or authorized use of your photographs.",
        "This applies regardless of whether Airplane Games generates revenue from its games, websites, advertising, sponsorships, subscriptions or other commercial activities incorporating the photographs.",
        "Submission does not establish an employment, contractor, agency, partnership or joint venture relationship between you and Airplane Games."
      ]
    },
    {
      "title": "7. Photographer Credit and Recognition",
      "blocks": [
        "Airplane Games values the contributions of photographers and is committed to recognizing their work.",
        "Airplane Games will provide photographic attribution wherever reasonably practicable, using the photographer's preferred name or credit information supplied at the time of submission.",
        "Attribution may appear directly on or adjacent to the photograph, within an image caption, on an information screen, within a photography gallery, in accompanying social media text or in another reasonably accessible location associated with the photograph.",
        "Certain advertising formats, technical limitations, interactive game mechanics or platform restrictions may prevent photographic attribution from appearing directly on every reproduction of an image. In such circumstances, Airplane Games will make reasonable efforts to provide credit through an appropriate alternative method where practicable.",
        "If an attribution is incorrect or unintentionally omitted, you may contact Airplane Games to request a correction. We will make reasonable efforts to correct verified attribution errors in materials under our control."
      ]
    },
    {
      "title": "8. Optional Instagram and Social Media Recognition",
      "blocks": [
        "Photographers may voluntarily provide an Instagram username or handle when submitting photographs.",
        "By choosing to provide a handle for public attribution, you authorize Airplane Games to display, reproduce, tag and, where supported, link to that handle in connection with your photographs and related Airplane Games features or promotions.",
        "Providing an Instagram handle is optional and is not required for photographic submission or consideration.",
        "You may request that Airplane Games update or discontinue future public display of your Instagram handle, subject to reasonable processing times and applicable law.",
        "Airplane Games does not guarantee social media tags, links, followers, engagement, website traffic or other benefits."
      ]
    },
    {
      "title": "9. Image Editing and Formatting",
      "blocks": [
        "To accommodate various game interfaces, devices, screen sizes, advertising formats and creative requirements, you authorize Airplane Games to make reasonable modifications to submitted photographs, including:",
        [
          "Cropping and resizing.",
          "Scaling and repositioning.",
          "File format conversion and compression.",
          "Color, brightness and contrast adjustments.",
          "Background formatting and graphical overlays.",
          "Addition of game graphics, branding, text and promotional elements.",
          "Integration into videos, animations, presentations and interactive experiences.",
          "Creation of thumbnails, previews and other display variations."
        ],
        "Airplane Games will make reasonable efforts to preserve the artistic integrity of submitted photographs and avoid materially misleading or derogatory alterations.",
        "Copyright notices and photographer identification will be respected. If formatting requires an embedded credit or watermark to be repositioned or omitted from the visible image, Airplane Games will make reasonable efforts to provide equivalent attribution elsewhere.",
        "Airplane Games will not knowingly remove or falsify copyright management information for the purpose of facilitating or concealing copyright infringement.",
        "Nothing in this Agreement is intended to waive any moral rights or other author protections that cannot lawfully be waived."
      ]
    },
    {
      "title": "10. Photographer Representations and Responsibilities",
      "blocks": [
        "By submitting photographs, you represent and warrant that:",
        "a. You are at least 18 years of age and have the legal capacity to enter into this Agreement.",
        "b. You are the original photographer and copyright owner, or you possess express authorization from the copyright owner to grant all rights described in this Agreement.",
        "c. Your submission does not violate any existing licensing agreement, employment agreement, contractual obligation or exclusive distribution arrangement.",
        "d. You have obtained any permissions, consents or releases legally required for the authorized uses of the photograph, including its potential commercial and advertising use.",
        "e. Your submission does not unlawfully infringe any third party's copyright, trademark, privacy, publicity, intellectual property or other legal rights.",
        "f. Your photograph was obtained lawfully and does not violate applicable airport security rules, restricted-access requirements, aviation regulations or other legal restrictions.",
        "g. Any identifying information, photographic credits and descriptions you provide are accurate to the best of your knowledge.",
        "h. You have disclosed any restrictions, third-party ownership claims or limitations that could affect Airplane Games' ability to use the photograph as described in this Agreement.",
        "Airplane Games reserves the right to request additional information, original image files, proof of ownership, permissions or releases before accepting or publishing a photograph."
      ]
    },
    {
      "title": "11. Aviation Branding and Third-Party Rights",
      "blocks": [
        "Submitted photographs may contain aircraft liveries, airline logos, manufacturer trademarks, airport facilities, aircraft registration numbers or other third-party identifying features.",
        "Ownership of a photograph does not necessarily include ownership of trademarks, artwork, designs, publicity rights or other intellectual property depicted within the photograph.",
        "You agree to disclose any known restrictions affecting the use of these elements.",
        "Airplane Games reserves the right to reject, crop, modify or restrict the use of photographs where additional permissions may be required.",
        "The inclusion of an aircraft, airline, manufacturer, airport or other third-party brand within Airplane Games does not, by itself, indicate sponsorship, affiliation, authorization or endorsement by that organization."
      ]
    },
    {
      "title": "12. Submission Guidelines and Prohibited Content",
      "blocks": [
        "Photographs submitted to Airplane Games must be appropriate for a general audience and consistent with our aviation-focused community.",
        "Airplane Games may reject or remove submissions that:",
        [
          "Were copied, downloaded or obtained from another photographer without authorization.",
          "Contain falsely represented ownership or photographer credits.",
          "Contain unlawful, offensive, sexually explicit, discriminatory, threatening or otherwise inappropriate material.",
          "Violate personal privacy or contain sensitive personal information.",
          "Contain confidential, proprietary or unlawfully obtained information.",
          "Were obtained through trespassing, unauthorized access or unlawful activity.",
          "Contain unauthorized commercial advertising or promotional content.",
          "Are entirely AI-generated or materially misrepresented as authentic aviation photography.",
          "Contain manipulated aviation details that could mislead users within educational or aircraft identification features.",
          "Otherwise conflict with Airplane Games' content, quality or community standards."
        ],
        "Standard photographic processing, including exposure adjustments, color correction, cropping and noise reduction, is generally permitted.",
        "Airplane Games reserves the right to determine whether submitted content meets its standards."
      ]
    },
    {
      "title": "13. Selection and Publication",
      "blocks": [
        "Submitting a photograph does not guarantee its selection, publication, inclusion in a game or designation as Plane of the Day.",
        "Airplane Games retains editorial and creative discretion regarding:",
        [
          "Whether a photograph is accepted or published.",
          "When and where it is displayed.",
          "Which games, features or promotional materials incorporate it.",
          "How frequently it is displayed.",
          "How long it remains available.",
          "Whether it is subsequently archived, replaced or removed."
        ],
        "Airplane Games may use an accepted photograph on multiple occasions and across multiple authorized platforms without obtaining additional permission or providing additional compensation.",
        "There is no minimum or guaranteed level of exposure."
      ]
    },
    {
      "title": "14. Photograph Removal and Withdrawal Requests",
      "blocks": [
        "We understand that circumstances may change after a photograph has been submitted.",
        "Photographers may contact Airplane Games to request that a photograph be removed from future use.",
        "Airplane Games will review reasonable removal requests in good faith and, where practicable, may agree to discontinue new uses of a photograph or remove it from active digital platforms under our control.",
        "Unless otherwise required by applicable law or agreed to in writing, submitting a removal request does not automatically revoke the copyright license previously granted under this Agreement.",
        "Airplane Games may be unable to immediately remove photographs from:",
        [
          "Previously distributed game versions.",
          "Downloaded or offline applications.",
          "Previously published advertising and promotional materials.",
          "Printed materials.",
          "Historical archives.",
          "Third-party social media shares.",
          "Previously distributed media productions.",
          "Secure backups and records maintained for legitimate business or legal purposes."
        ],
        "Nothing in this section limits any mandatory statutory copyright termination rights, privacy rights, data deletion rights or other protections available under applicable law."
      ]
    },
    {
      "title": "15. Privacy and Personal Information",
      "blocks": [
        "Airplane Games may collect and process information associated with your photographic submission, including your name, email address, preferred photographer credit, optional Instagram handle, photograph descriptions and submission records.",
        "This information may be used to:",
        [
          "Review and administer photographic submissions.",
          "Verify copyright ownership and permissions.",
          "Communicate regarding your submission.",
          "Provide public photographer attribution.",
          "Administer photography galleries and featured photography programs.",
          "Maintain records of licenses and permissions.",
          "Address copyright claims, legal obligations and security concerns."
        ],
        "Your email address will not be publicly displayed as part of your photographic credit unless you separately authorize such disclosure.",
        "Personal information will be handled in accordance with the Airplane Games Privacy Policy and applicable privacy laws.",
        "Copyright permissions granted under this Agreement are distinct from the processing of personal information. Nothing in this Agreement limits your applicable statutory privacy rights."
      ]
    },
    {
      "title": "16. Artificial Intelligence and Image Protection",
      "blocks": [
        "The license granted under this Agreement does not authorize Airplane Games to use submitted photographs to train generative artificial intelligence models or to license submitted photographs to third parties for that purpose.",
        "Airplane Games may use automated tools to support image processing, moderation, organization, classification, accessibility, security and other legitimate operational functions, subject to its Privacy Policy and applicable law.",
        "Airplane Games will take reasonable measures to protect stored photographs and associated information against unauthorized access.",
        "However, photographs displayed through publicly accessible websites, applications or social media platforms may be copied, captured, shared or otherwise reproduced by third parties without authorization.",
        "Airplane Games cannot guarantee that publicly displayed photographs will be protected from unauthorized third-party use."
      ]
    },
    {
      "title": "17. Copyright Infringement and Rights Complaints",
      "blocks": [
        "Airplane Games respects the intellectual property rights of photographers and other rights holders.",
        "If you believe that a photograph displayed by Airplane Games infringes your copyright, violates your privacy rights or otherwise uses your intellectual property without authorization, please contact us at atc@playairplanegames.com",
        "Please provide sufficient information to identify the photograph, explain the nature of your claim and establish your relationship to the applicable rights.",
        "Airplane Games reserves the right to temporarily restrict or remove disputed content while investigating a claim.",
        "Where applicable, copyright infringement notices and counter-notices will be processed in accordance with the Digital Millennium Copyright Act and other applicable laws."
      ]
    },
    {
      "title": "18. Liability and Indemnification",
      "blocks": [
        "To the extent permitted by applicable law, you agree to indemnify and hold harmless Airplane Games, its legal operating entity and authorized representatives from third-party claims, damages, liabilities and reasonable legal expenses arising from your material breach of the representations and warranties contained in this Agreement, including the unauthorized submission of photographs belonging to another copyright owner.",
        "This obligation does not apply to claims caused by Airplane Games' unauthorized use of a photograph, negligence or unlawful conduct.",
        "Nothing in this Agreement excludes or limits any liability or statutory protection that cannot lawfully be excluded or limited."
      ]
    },
    {
      "title": "19. Changes to This Agreement",
      "blocks": [
        "Airplane Games may update this Photo Submission Policy and Image License Agreement from time to time.",
        "Updates will be identified by a revised effective date.",
        "The version of the Agreement accepted at the time of submission will govern the license granted for that photograph unless you subsequently agree to revised terms or changes are required by applicable law.",
        "Material expansions of the permitted uses of previously submitted photographs will require additional authorization where necessary."
      ]
    },
    {
      "title": "20. Governing Law",
      "blocks": [
        "Subject to mandatory protections available under applicable law, this Agreement shall be governed by the laws of the State of California and applicable federal laws of the United States.",
        "Nothing in this Agreement deprives photographers of mandatory legal protections applicable in their jurisdiction.",
        "If any provision of this Agreement is determined to be invalid or unenforceable, the remaining provisions shall continue in effect to the extent permitted by law."
      ]
    },
    {
      "title": "21. Contact Information",
      "blocks": [
        "For questions regarding photographic submissions, copyright, attribution, privacy or photograph removal requests, please contact:",
        "Airplane Games: The Aviation Arcade",
        "Legal Entity: Airplane Games",
        "Website: https://playairplanegames.com/",
        "Photography Inquiries: atc@playairplanegames.com",
        "Copyright and Legal Inquiries: atc@playairplanegames.com",
        "Mailing Address: 9250 Reseda Blvd, Suite 108, Northridge, CA 91324"
      ]
    },
    {
      "title": "22. Acceptance of Agreement",
      "blocks": [
        "By affirmatively accepting this Agreement and submitting your photograph, you acknowledge that:",
        [
          "You have read and understood this Agreement.",
          "You have the legal authority to grant the rights described herein.",
          "You retain copyright ownership of your original photographs.",
          "You authorize Airplane Games to use your photographs worldwide for the purposes described in this Agreement.",
          "You understand that no monetary compensation or royalties will be paid.",
          "You voluntarily agree to the terms of this Agreement."
        ],
        "Thank you for sharing your passion for aviation and helping us celebrate the incredible world of flight.",
        "Airplane Games: The Aviation Arcade"
      ]
    }
  ],
};
