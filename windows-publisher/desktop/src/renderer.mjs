const fields = {
  title: document.querySelector("#title"),
  summary: document.querySelector("#summary"),
  topicTag: document.querySelector("#topic-tag"),
  content: document.querySelector("#content"),
};
const progress = document.querySelector("#progress");
const connectionState = document.querySelector("#connection-state");
const accountCopy = document.querySelector("#account-copy");
const imageName = document.querySelector("#image-name");
const publishButton = document.querySelector("#publish-button");
let imagePath = "";
let defaultsLoaded = false;

function setProgress(message, type = "") {
  progress.textContent = message;
  progress.dataset.type = type;
}

function setBusy(busy) {
  publishButton.disabled = busy;
  publishButton.textContent = busy ? "发布中..." : "发布文章";
}

function displayName(path) {
  return path.split(/[\\/]/).pop() || "尚未选择";
}

async function refreshState() {
  const state = await window.publisher.getState();
  if (!defaultsLoaded && state.defaultArticle) {
    fields.title.value = state.defaultArticle.title || "";
    fields.summary.value = state.defaultArticle.summary || "";
    fields.topicTag.value = state.defaultArticle.topicTag || "暗区突围";
    fields.content.value = state.defaultArticle.content || "";
    defaultsLoaded = true;
  }
  connectionState.textContent = state.s3Configured ? "S3 配置已内置" : "S3 配置未完成";
  connectionState.dataset.ready = String(state.s3Configured);
  accountCopy.textContent = state.profileExists ? "已存在本机登录资料；需要更换账号时重新登录即可。" : "首次使用请点击“登录抖音”并完成扫码。";
}

document.querySelector("#image-button").addEventListener("click", async () => {
  const selected = await window.publisher.chooseImage();
  if (!selected) return;
  imagePath = selected;
  imageName.textContent = displayName(selected);
});

document.querySelector("#login-button").addEventListener("click", async () => {
  try {
    setProgress(await window.publisher.login());
  } catch (error) {
    setProgress(error.message, "error");
  }
});

document.querySelector("#finish-login-button").addEventListener("click", async () => {
  try {
    setProgress(await window.publisher.finishLogin());
    await refreshState();
  } catch (error) {
    setProgress(error.message, "error");
  }
});

document.querySelector("#article-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  setBusy(true);
  try {
    const result = await window.publisher.publish({
      title: fields.title.value,
      summary: fields.summary.value,
      topicTag: fields.topicTag.value,
      content: fields.content.value,
      imagePath,
    });
    setProgress(`发布请求已提交，图片地址：${result.imageUrl}`, "success");
  } catch (error) {
    setProgress(error.message || "发布失败。", "error");
  } finally {
    setBusy(false);
  }
});

window.publisher.onProgress((message) => setProgress(message));
refreshState().catch((error) => setProgress(error.message, "error"));
