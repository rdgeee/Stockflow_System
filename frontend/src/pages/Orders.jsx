import ResourcePage from "./ResourcePage.jsx";

export default function Orders({ globalQuery, user }) {
  return <ResourcePage resource="Orders" globalQuery={globalQuery} user={user} />;
}
