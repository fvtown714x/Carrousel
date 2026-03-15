import { useState, useEffect } from "react";
import { Modal, Button, Text } from "@shopify/polaris";
import { useFetcher } from "react-router";

export default function ContentLibrary() {

  const fetcher = useFetcher();
  const [openModal, setOpenModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [media, setMedia] = useState([]);
  const uploading = fetcher.state !== "idle";
  
  // carregar biblioteca
  const loadMedia = async () => {
    const res = await fetch("/api/videos/list");
    const data = await res.json();

    if (data.media) {
      setMedia(data.media);
    }
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const uploadFile = () => {

    if (!selectedFile) return;
    
    const formData = new FormData();
    formData.append("file", selectedFile);

    fetcher.submit(formData, {
      method: "post",
      action: "/api/videos/upload",
      encType: "multipart/form-data",
    });

  };

  useEffect(() => {

    if (fetcher.data) {

     

      if (fetcher.data.success) {
        loadMedia();
        setOpenModal(false);
        setSelectedFile(null);
      } else {
        alert("Upload failed");
      }

    }

  }, [fetcher.data]);

  return (
    <s-page heading="Content Library">

      <s-stack direction="inline" gap="base">

        <Button onClick={() => setOpenModal(true)}>
          Add New Content
        </Button>

      </s-stack>

      <div style={{ height: "20px" }} />

      <MediaGrid media={media} />

      <UploadModal
        open={openModal}
        setOpenModal={setOpenModal}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        uploadFile={uploadFile}
        uploading={uploading}
      />

    </s-page>
  );
}

function MediaGrid({ media }) {

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))",
      gap: "16px"
    }}>

      {media.map((item) => (

        <MediaCard key={item.id} item={item} />

      ))}

    </div>
  );
}

function MediaCard({ item }) {

  const [hover, setHover] = useState(false);

  return (

    <div
      style={{
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #e3e3e3",
        cursor: "pointer",
        background: "#fff"
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >

      {item.type === "VIDEO" ? (

        hover ? (

          <video
            src={item.url}
            autoPlay
            muted
            loop
            controls
            style={{ width: "100%" }}
          />

        ) : (

          <img
            src={item.thumbnail || item.url}
            style={{ width: "100%" }}
          />

        )

      ) : (

        <img
          src={item.url}
          style={{ width: "100%" }}
        />

      )}

    </div>
  );
}
function UploadModal({
  open,
  setOpenModal,
  selectedFile,
  setSelectedFile,
  uploadFile,
  uploading
}) {

  return (

    <Modal
      open={open}
      onClose={() => setOpenModal(false)}
      title="Add new content"
      primaryAction={{
        content: uploading ? "Uploading..." : "Start Upload",
        onAction: uploadFile,
        disabled: !selectedFile || uploading
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: () => setOpenModal(false)
        }
      ]}
    >

      <Modal.Section>

        <div
          style={{
            border: "2px dashed #ddd",
            borderRadius: "12px",
            padding: "40px",
            textAlign: "center"
          }}
        >

          <input
            type="file"
            accept="video/*,image/*"
            onChange={(e) => setSelectedFile(e.target.files[0])}
          />

          {selectedFile && (
            <p>{selectedFile.name}</p>
          )}

        </div>

      </Modal.Section>

    </Modal>
  );
}