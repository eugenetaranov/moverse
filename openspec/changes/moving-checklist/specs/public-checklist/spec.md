# Spec Delta

## Purpose

A free, public, search-optimised moving checklist page on the marketing site. It brings in people planning a move and introduces them to Moverse's box inventory.

## ADDED Requirements

### Requirement: Public checklist page

The marketing site SHALL serve the `general` template at `/moving-checklist`, viewable without an account. The full task content SHALL be in the server-rendered HTML.

#### Scenario: Anonymous visitor

- **WHEN** a visitor with no account opens `/moving-checklist`
- **THEN** they see every phase and task of the `general` template

#### Scenario: Content visible without JavaScript

- **WHEN** the page is fetched with JavaScript disabled
- **THEN** all task titles and notes are present in the HTML

### Requirement: Search metadata

The page SHALL have:
- a unique title and meta description;
- a canonical URL;
- Open Graph tags;
- structured data describing the checklist as an ordered list of steps.

It SHALL be listed in the site's sitemap.

#### Scenario: Sitemap entry

- **WHEN** the sitemap is fetched
- **THEN** it contains the `/moving-checklist` URL

### Requirement: Progress saved in the browser

Visitors SHALL be able to tick tasks off. Ticks SHALL be saved only in that browser and SHALL survive a reload. If browser storage is unavailable, ticking SHALL still work for the current visit. A "reset" control SHALL clear all ticks.

#### Scenario: Ticks survive reload

- **WHEN** a visitor ticks three tasks and reloads the page
- **THEN** the same three tasks are still ticked

#### Scenario: Storage blocked

- **WHEN** browser storage is blocked
- **THEN** ticking works until the page is closed, and no error is shown

### Requirement: Move date and due dates

Visitors SHALL be able to enter a move date. Every task then shows its due date and tasks past their due date are marked overdue. The date SHALL be saved in the browser like ticks.

#### Scenario: Entering a move date

- **WHEN** a visitor enters a move date six weeks from today
- **THEN** each task shows its due date, and tasks from the 8-weeks phase show as overdue

### Requirement: Printable layout

The page SHALL provide a print layout suitable for saving as PDF:
- phases as sections;
- tick boxes;
- due dates when a move date is set;
- the Moverse name and URL in the footer;
- no site navigation.

#### Scenario: Print to PDF

- **WHEN** the visitor prints the page
- **THEN** the output shows the checklist with empty tick boxes, any due dates, and no navigation

### Requirement: App call-to-action on packing tasks

Tasks that have an action link SHALL show a short call-to-action for Moverse, linking to the app's store listing or to the in-app destination when opened on a device with the app installed. The page SHALL show no prices and no checkout.

#### Scenario: Packing task CTA

- **WHEN** a visitor views "Label and photograph every box"
- **THEN** a Moverse call-to-action with a store link is shown next to the task
