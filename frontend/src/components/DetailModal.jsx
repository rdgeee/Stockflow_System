import { useFetch } from "../api/useFetch.js";
import Modal from "./Modal.jsx";
import Button from "./Button.jsx";

/** Loads one record from `endpoint` and renders it with render(record). */
export default function DetailModal({ title, endpoint, render, onClose }) {
  const { data, loading, error } = useFetch(endpoint);
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="detail-body">
        {loading && <p className="detail-note">Loading…</p>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {data?.data && render(data.data)}
      </div>
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Close</Button></div>
    </Modal>
  );
}
