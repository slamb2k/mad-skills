# User Flow Template

Use this template when mapping user journeys through your interface.

## User Flow Structure

### Flow Overview

**Flow Name:** [Descriptive name of the flow]
**Primary User:** [Which persona is this for?]
**User Goal:** [What is the user trying to achieve?]
**Success Metric:** [How do you measure successful completion?]

### Flow Diagram

```
Entry Point → Step 1 → Decision Point → Step 2 → Success
                              ↓
                         Error Recovery → Step 2
```

### Detailed Steps

#### Entry Point
**Where does the user start?**
- Homepage
- Landing page
- Email link
- Search result
- Social media
- Direct URL

**User context at entry:**
- What do they know?
- What are they expecting?
- What device are they likely using?

---

#### Step 1: [First Action]
**What the user does:** [Description]
**What they see:** [Screen/page description]
**What they think:** [Expected mental model]

**Potential friction points:**
- Unclear what to do next?
- Too many options?
- Missing information?

**Design considerations:**
- Clear call-to-action
- Helpful guidance
- Error prevention

---

#### Decision Point: [Choice or Condition]
**Condition:** What determines the path?
**Options:**
- **Option A:** → [Next step if A]
- **Option B:** → [Next step if B]
- **Option C:** → [Next step if C]

**Design considerations:**
- Make options clearly distinct
- Provide context for decision
- Allow easy return/correction

---

#### Step 2: [Next Action]
[Repeat step structure as needed]

---

#### Success State
**What success looks like:**
- Task completed
- Clear confirmation
- Next steps offered

**What the user feels:**
- Satisfied
- Confident
- Ready to continue

---

#### Error/Alternative Paths

**Common errors:**
1. [Error type] → [Recovery path]
2. [Error type] → [Recovery path]

**Exit points:**
- Where might users abandon flow?
- Why would they leave?
- How to prevent or recover?

---

## Example User Flows

### Example 1: E-commerce Purchase Flow

**Flow Name:** First-Time Product Purchase
**Primary User:** Sarah (busy professional, mobile-first)
**User Goal:** Buy running shoes quickly and confidently
**Success Metric:** Completed purchase, confirmation email received

**Flow:**

```
Homepage → Product Search → Product Details → Add to Cart
                                                    ↓
Size Selection Modal                              Cart Review → Checkout
        ↓                                                            ↓
    Confirm Selection                                      Shipping Info → Payment → Confirmation
        ↓                                                      ↓                ↓
    Added Notification                                  Saved Address    Saved Card
                                                            ↓                ↓
                                                        Review          Review
```

**Detailed Steps:**

**Entry: Homepage**
- User arrives from Google search "running shoes"
- Expecting: Shoe selection, easy browsing
- Device: Mobile (70% of traffic)

**Step 1: Search**
- User types "running shoes women" in search
- Sees: Grid of products with images, prices, ratings
- Friction: Too many options (300+ results)
- Solution: Smart filters (size, brand, price)

**Step 2: Product Detail**
- User taps product card
- Sees: Large images, reviews, size chart, "Add to Cart" CTA
- Friction: Uncertain about size
- Solution: Size guide, reviews mention fit

**Decision: Size Selection**
- Modal appears with size options
- Context: Size chart visible, "True to size" indicator
- Required: Must select size to add to cart

**Step 3: Add to Cart**
- Success toast: "Added to cart"
- Options: "Continue shopping" or "View cart"
- 60% continue shopping, 40% checkout immediately

**Step 4: Cart Review**
- Shows: Product, size, quantity, price
- Edit options: Change quantity, remove item
- Clear CTA: "Proceed to Checkout"

**Step 5: Checkout**
- Shipping address (saved if returning user)
- Payment method (saved if returning user)
- Order review
- Single page vs multi-step based on A/B test

**Success: Confirmation**
- Order number displayed
- Email confirmation sent
- Estimated delivery date
- Next step: "Track order" or "Continue shopping"

**Error Paths:**
- **Out of stock:** Show similar products
- **Payment declined:** Clear error, retry option
- **Shipping address invalid:** Suggest corrections

**Exit Points:**
- Search results (too many options → better filters)
- Product page (price too high → show value, reviews)
- Checkout (unexpected shipping cost → show earlier)

---

### Example 2: SaaS Onboarding Flow

**Flow Name:** New User Account Setup
**Primary User:** David (IT Director, desktop user)
**User Goal:** Set up secure team account with proper permissions
**Success Metric:** Team invited, first project created, security configured

**Flow:**

```
Sign Up → Email Verification → Profile Setup → Team Setup
                                                     ↓
                                              Invite Team → Security Settings → First Project
```

**Detailed Steps:**

**Entry: Sign Up Page**
- Arrived from marketing site "Start Free Trial"
- Expectations: Professional, secure, straightforward
- Concerns: Data security, team permissions

**Step 1: Account Creation**
- Work email required (no personal emails)
- Strong password requirements shown
- Company name field
- See: Security badges, privacy policy link

**Step 2: Email Verification**
- Confirmation email sent immediately
- Clear instructions in email
- Return to product after verification
- Fallback: Manual verification link

**Step 3: Profile Setup**
- Role selection (Admin/User)
- Department (for categorization)
- Use cases (for personalization)
- Optional: Profile picture

**Step 4: Team Invitation**
- Add team members by email
- Assign roles (Admin/Editor/Viewer)
- Bulk upload option for larger teams
- Can skip (but encouraged to invite at least 1)

**Step 5: Security Configuration**
- Two-factor authentication setup
- SSO integration option
- IP whitelist option
- Compliance requirements checklist

**Step 6: First Project**
- Guided project creation
- Template selection
- Import existing data option
- Sample data for exploration

**Success: Dashboard**
- Welcome message
- Team status visible
- Quick action buttons
- Link to comprehensive documentation

**Progressive Disclosure:**
- Critical: Email, password, role
- Important: Team invites, security
- Optional: Advanced settings, integrations

---

### Example 3: Mobile App First Use

**Flow Name:** Fitness App First Workout
**Primary User:** Marcus (personal trainer, mobile-first)
**User Goal:** Complete first workout tracking
**Success Metric:** Workout logged, felt easy and quick

**Flow:**

```
App Launch → Permission Requests → Goal Setting → First Workout
                                                         ↓
                                               Exercise Selection → Timer → Completion
```

**Detailed Steps:**

**Entry: App Launch**
- First time opening app
- Just downloaded from App Store
- Expecting: Quick start, not lengthy setup

**Step 1: Permissions**
- Health data access (for tracking)
- Notifications (for reminders)
- Camera (for progress photos)
- Each explained with benefit

**Step 2: Goal Setting**
- Fitness goal (lose weight, gain muscle, maintain)
- Experience level (beginner, intermediate, advanced)
- Available time per workout
- Can modify later

**Step 3: First Workout Prompt**
- "Ready for your first workout?"
- Pre-selected based on goals
- "Quick Tour" option for UI explanation
- Can browse workouts instead

**Step 4: Exercise Selection**
- Simple list of exercises
- Tap to add to today's workout
- Popular/recommended highlighted
- Search for specific exercises

**Step 5: During Workout**
- Exercise name and demo GIF
- Timer for sets/reps
- Easy logging (checkmarks or swipes)
- Minimal UI, maximum screen space

**Success: Completion**
- Celebration animation
- Workout summary
- Share option
- "Schedule next workout" CTA

**Recovery Paths:**
- Paused mid-workout → "Resume" or "End"
- Closed app → "Continue workout" on reopen
- Different exercise → Easy swap

---

## User Flow Best Practices

### Keep Flows Simple

**Minimize steps:**
- Every step is a chance to lose users
- Combine steps where logical
- Remove unnecessary fields

**Progressive disclosure:**
- Show only what's needed now
- Reveal advanced options later
- Don't overwhelm upfront

### Provide Clear Paths

**Visual clarity:**
- Clear primary CTA at each step
- Secondary options less prominent
- Breadcrumbs for multi-step processes

**Feedback:**
- Show current step
- Indicate steps remaining
- Confirm actions taken

### Handle Errors Gracefully

**Prevention:**
- Validate as user types
- Clear input format examples
- Disable impossible choices

**Recovery:**
- Specific error messages
- Clear fix instructions
- Easy return to previous step

### Test and Iterate

**Methods:**
- User testing (observe real users)
- Analytics (where do users drop off?)
- A/B testing (compare variations)
- Support tickets (common problems)

**Iterate:**
- Remove friction points
- Simplify complex steps
- Add helpful context
- Test again

---

## User Flow Checklist

- [ ] Clear entry point identified
- [ ] User goal explicitly stated
- [ ] Each step has clear purpose
- [ ] Decision points well-defined
- [ ] Success state described
- [ ] Error paths mapped
- [ ] Exit points identified
- [ ] Friction points noted
- [ ] Mobile considerations included
- [ ] Accessibility considered
- [ ] Analytics tracking planned
- [ ] Alternative paths documented

---

## Common Flow Patterns

### Linear Flow
**When to use:** Simple, sequential tasks
**Example:** Sign up, checkout, form submission

### Hub and Spoke
**When to use:** Dashboard with multiple features
**Example:** Social media app, productivity tool

### Guided Flow
**When to use:** Complex processes needing explanation
**Example:** Tax software, loan application

### Open-Ended Flow
**When to use:** Exploration and discovery
**Example:** Shopping, content browsing

---

## Mapping Tools

**Simple flows:**
- Text outline (like these examples)
- Whiteboard sketch
- Sticky notes

**Complex flows:**
- Flowchart tools (Figma, Miro, Lucidchart)
- Specialized UX tools (Overflow, FlowMapp)
- Collaborative tools for teams

**Key:** Choose tool that helps thinking, not impresses stakeholders
