const prisma = require("../database/prisma");
const pushNotificationService = require("./push-notification.service");

function dispatch(label, fn) {
  Promise.resolve()
    .then(fn)
    .catch((err) => console.warn(`[PUSH] ${label}:`, err.message));
}

async function actorName(userid) {
  const u = await prisma.users.findUnique({
    where: { userid: Number(userid) },
    select: { name: true }
  });
  return u?.name || "User";
}

function jobLabel(job) {
  if (!job) return "";
  return job.code || job.manualjobno || `Job #${job.recno}`;
}

function baseJobData(job, auth, event) {
  return {
    type: event,
    event,
    jobid: job.recno,
    jobCode: jobLabel(job),
    tenantid: auth.tenantid,
    branchid: auth.branchid,
    actorUserid: auth.userid
  };
}

async function notifyAdminsForJob(job, auth, event, title, body, extra = {}) {
  await pushNotificationService.notifyAdmins(Number(auth.tenantid), Number(auth.branchid), {
    title,
    body,
    data: { ...baseJobData(job, auth, event), ...extra }
  });
}

async function notifyTechnician(userid, job, auth, event, title, body, extra = {}) {
  if (!userid) return;
  await pushNotificationService.notifyUsers([Number(userid)], {
    title,
    body,
    data: { ...baseJobData(job, auth, event), ...extra }
  });
}

class PushDispatchService {
  /** 1 — Announcement → all active branch/tenant members */
  onAnnouncementCreated(announcement) {
    dispatch("announcement", async () => {
      await pushNotificationService.sendAnnouncementPushToAll(announcement);
    });
  }

  /** 2 — Job assigned → assigned technician */
  onJobAssigned(job, assignedTo, auth) {
    dispatch("job_assigned", async () => {
      const by = await actorName(auth.userid);
      const label = jobLabel(job);
      await notifyTechnician(
        assignedTo,
        job,
        auth,
        "job_assigned",
        "New job assigned",
        `${by} assigned you to ${label}`,
        { assignedTo: String(assignedTo) }
      );
    });
  }

  /** 3 — Job start / stop (work ended) / resolve → admin */
  onJobStarted(job, auth) {
    dispatch("job_started", async () => {
      const by = await actorName(auth.userid);
      await notifyAdminsForJob(
        job,
        auth,
        "job_started",
        "Job started",
        `${by} started work on ${jobLabel(job)}`
      );
    });
  }

  onJobWorkStopped(job, auth, remarks, customerFeedback = null) {
    dispatch("job_stopped", async () => {
      const by = await actorName(auth.userid);
      let reviewPart = "";
      if (customerFeedback?.rating != null) {
        reviewPart = ` Customer rating: ${customerFeedback.rating}/5.`;
        if (customerFeedback.comments) {
          reviewPart += ` "${customerFeedback.comments}"`;
        }
      }
      await notifyAdminsForJob(
        job,
        auth,
        "job_stopped",
        "Job work stopped",
        `${by} stopped work on ${jobLabel(job)}${reviewPart}${remarks ? ` (${remarks})` : ""}`,
        {
          rating: customerFeedback?.rating ?? "",
          feedbackComments: customerFeedback?.comments ?? ""
        }
      );
    });
  }

  onJobResolved(job, auth) {
    dispatch("job_resolved", async () => {
      const by = await actorName(auth.userid);
      await notifyAdminsForJob(
        job,
        auth,
        "job_resolved",
        "Job resolved",
        `${by} resolved ${jobLabel(job)}`
      );
    });
  }

  /** 4 — Job completed → technician with customer review summary */
  onJobCompleted(job, auth, customerFeedback) {
    dispatch("job_completed", async () => {
      const by = await actorName(auth.userid);
      const label = jobLabel(job);
      const targetUser = job.assignedto || auth.userid;

      let reviewPart = "";
      if (customerFeedback?.rating != null) {
        reviewPart = ` Customer rating: ${customerFeedback.rating}/5.`;
        if (customerFeedback.comments) {
          reviewPart += ` "${customerFeedback.comments}"`;
        }
      } else {
        reviewPart = " No customer feedback recorded.";
      }

      await notifyTechnician(
        targetUser,
        job,
        auth,
        "job_completed",
        "Job completed",
        `${label} completed by ${by}.${reviewPart}`,
        {
          rating: customerFeedback?.rating ?? "",
          feedbackComments: customerFeedback?.comments ?? ""
        }
      );
    });
  }

  /** 5 — Travel start / stop → admin */
  onTravelStarted(job, auth) {
    dispatch("travel_started", async () => {
      const by = await actorName(auth.userid);
      await notifyAdminsForJob(
        job,
        auth,
        "travel_started",
        "Travel started",
        `${by} started travel for ${jobLabel(job)}`
      );
    });
  }

  onTravelStopped(job, auth) {
    dispatch("travel_stopped", async () => {
      const by = await actorName(auth.userid);
      await notifyAdminsForJob(
        job,
        auth,
        "travel_stopped",
        "Travel stopped",
        `${by} stopped travel for ${jobLabel(job)}`
      );
    });
  }

  /** 6 — Comment / attachment → admin */
  onJobComment(job, auth, commentText) {
    dispatch("job_comment", async () => {
      const by = await actorName(auth.userid);
      const preview =
        commentText && String(commentText).length > 120
          ? `${String(commentText).slice(0, 117)}...`
          : commentText || "";
      await notifyAdminsForJob(
        job,
        auth,
        "job_comment",
        "New job comment",
        `${by} commented on ${jobLabel(job)}: ${preview}`
      );
    });
  }

  onJobAttachment(job, auth, attachmentName) {
    dispatch("job_attachment", async () => {
      const by = await actorName(auth.userid);
      const name = attachmentName || "Attachment";
      await notifyAdminsForJob(
        job,
        auth,
        "job_attachment",
        "New job attachment",
        `${by} added "${name}" to ${jobLabel(job)}`
      );
    });
  }

  /** 7 — Job status changed → admin */
  onJobStatusChanged(job, auth, fromStatus, toStatus, remarks) {
    dispatch("job_status_changed", async () => {
      const by = await actorName(auth.userid);
      const label = jobLabel(job);
      const body = `${by} changed status on ${label}${remarks ? `: ${remarks}` : ""}`;

      await notifyAdminsForJob(job, auth, "job_status_changed", "Job status updated", body, {
        fromStatus: fromStatus ?? "",
        toStatus: toStatus ?? ""
      });
    });
  }

  /** 8 — Attendance → admin */
  onAttendanceAction(auth, action, location) {
    dispatch(`attendance_${action}`, async () => {
      const by = await actorName(auth.userid);
      const titles = {
        check_in: "Check-in",
        check_out: "Check-out",
        break_in: "Break started",
        break_out: "Break ended"
      };
      const title = titles[action] || "Attendance update";
      const addr = location?.address ? ` at ${location.address}` : "";

      await pushNotificationService.notifyAdmins(Number(auth.tenantid), Number(auth.branchid), {
        title,
        body: `${by}: ${title}${addr}`,
        data: {
          type: "attendance",
          event: action,
          tenantid: auth.tenantid,
          branchid: auth.branchid,
          actorUserid: auth.userid,
          latitude: location?.latitude ?? "",
          longitude: location?.longitude ?? ""
        }
      });
    });
  }
}

module.exports = new PushDispatchService();
