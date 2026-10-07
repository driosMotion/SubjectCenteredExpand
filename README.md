# Subject-Centered Expand v2

This Photoshop script expands an image into a square master using **Generative Expand**, then exports subject-aware crops in several common aspect ratios.

The source image can be landscape, portrait, or square. The finished master is always a square whose side is **twice the longest side of the source image**.

For example:

- A 3000 × 2000 source produces a 6000 × 6000 master.
- A 2000 × 3000 source produces a 6000 × 6000 master.
- A 2048 × 2048 source produces a 4096 × 4096 master.

The Generative Expand command is built into the script. You do not need to install or load an `.atn` action.

## Requirements

- Adobe Photoshop with Generative Expand support.
- An active internet connection and access to Adobe's generative services.
- A locally saved source image. Save the image before running the script.

## Running the script

1. Open the source image in Photoshop.
2. Save it locally if it has not been saved yet.
3. In Photoshop, choose **File → Scripts → Browse**.
4. Select `SubjectCenteredExpand_v002.jsx`.
5. Configure the options described below.
6. Click **Run**.

## Subject-position grid

Use the 3 × 3 grid to describe where the main subject is located in the source image.

For example:

- Choose the upper-left cell when the subject is near the upper-left area.
- Choose the center cell when the subject is centered.
- Choose the lower-center cell when the subject is near the bottom center.

The script uses this information when creating each exported crop. It attempts to keep the subject in the corresponding area of every output ratio. If an exact placement would move the crop outside the master, the nearest valid placement is used.

## Options

### Work on a duplicate

Recommended: **enabled**.

Photoshop duplicates the source document before expanding it. The original document remains unchanged.

If this option is disabled, the active source document is expanded directly.

### Run Generative Expand automatically

Recommended: **enabled**.

The script creates the calculated square crop and invokes Photoshop's Generative Expand command directly. No Photoshop action file is required.

If disabled, the script only enlarges the canvas to the calculated square size. The added area remains transparent and no AI generation is performed.

### Export selected ratios automatically

- Leave this **disabled** when you want to inspect the generated result and choose your preferred variation before exporting.
- Enable it for a fully automatic run. The current generated result is exported immediately after Generative Expand finishes.

### Export ratios

Select any combination of:

- Portrait: 2:3, 3:4, 4:5, and 9:16
- Landscape: 3:2, 4:3, 5:4, and 16:9

At least one ratio must be selected before exporting.

## Recommended workflow: generate, review, then export

1. Open and save the source image.
2. Run the script.
3. Select the cell that best represents the subject's position.
4. Keep **Work on a duplicate** enabled.
5. Keep **Run Generative Expand automatically** enabled.
6. Leave **Export selected ratios automatically** disabled.
7. Select the output ratios you need.
8. Click **Run**.
9. Review the Generative Expand result and choose the preferred Photoshop variation.
10. Click **Batch Export** in the script window.

## Fully automatic workflow

1. Configure the subject position and desired ratios.
2. Enable all three checkboxes.
3. Click **Run**.

Photoshop generates the square master and immediately saves the master and selected crops.

## Batch Export

The **Batch Export** button exports the prepared master currently associated with the script window.

It can also export a previously prepared v2 master after reopening the script, provided the document still contains the metadata written by v2 and its dimensions have not been changed.

The button creates:

- One layered master PSD.
- One PNG for every selected aspect ratio.

## Output location and names

Outputs are saved beside the original source in a folder named:

```text
SOURCE_NAME_Adaptations
```

For a source named `portrait.jpg`, typical output names are:

```text
portrait_expand.psd
portrait_expand_2x3.png
portrait_expand_3x4.png
portrait_expand_16x9.png
```

Existing files are never overwritten. If those names already exist, the script adds a run number:

```text
portrait_expand_2.psd
portrait_expand_2x3_2.png
```

## Troubleshooting

### “Save the source document locally before running this script”

Save the active image to a local folder, then run the script again.

### Generative Expand does not start

Confirm that:

- Your Photoshop version supports Generative Expand.
- You are signed in to Adobe Creative Cloud.
- Generative services are available for your account.
- The computer has an active internet connection.
- **Run Generative Expand automatically** is enabled.

### The exported subject is not exactly at the selected grid position

Some combinations of subject location and extreme aspect ratio cannot fit inside the 2× square master at the exact requested position. The script uses the nearest valid crop and reports how many exports were constrained.

### “The active document is not a v2 prepared master”

Activate the original saved source and click **Run** first. A v1 master or a document whose size changed after preparation cannot be exported as a v2 master.

### The expanded area is transparent

This happens when **Run Generative Expand automatically** is disabled. Run again with that option enabled to use Photoshop's Generative Expand service.

## Script file

`SubjectCenteredExpand_v002.jsx`

